import { AiResponseError, type AiClient } from '@tabitha/ai'
import { expand_token, run_check } from '#lib/server/check.js'
import { check_input_safety } from './input_guard'
import { build_repair_instruction, build_system_instruction, type CheckerFeedback } from './prompts'
import { phase_1_response_schema } from './response_schema'
import type { CheckerToken, EditorCheckResult, AiAssistResult } from '@tabitha/types'

const MAX_REPAIR_ATTEMPTS = 1
const EMPTY_CHECK: EditorCheckResult = { status: 'ok', tokens: [], back_translation: '' }
const STATUS_RANK = { ok: 2, warning: 1, error: 0 }

type Phase1Generation = {
	phase_1: string
	notes?: string[]
}

export async function generate_phase_1({ text, ai }: { text: string, ai: AiClient }): Promise<AiAssistResult> {
	if (!text.trim()) {
		return call_failure('Enter some text to encode.')
	}

	const safety_issue = check_input_safety(text)
	if (safety_issue) {
		return call_failure(safety_issue)
	}

	try {
		return await generate_and_check({ text, ai, system_instruction: build_system_instruction(), attempts_left: MAX_REPAIR_ATTEMPTS })
	} catch (error) {
		if (error instanceof AiResponseError) return call_failure(error.message)
		throw error
	}
}

async function generate_and_check({ text, ai, system_instruction, attempts_left }: { text: string, ai: AiClient, system_instruction: string, attempts_left: number }): Promise<AiAssistResult> {
	const generation = await ai.generate_json<Phase1Generation>({
		contents: { english_text: text },
		system_instruction,
		schema: phase_1_response_schema,
	})

	const phase_1 = sanitize(generation.phase_1)
	const notes = generation.notes ?? []
	const check = await run_check(phase_1)
	const result: AiAssistResult = { status: 'ok', phase_1, notes, check }

	if (check.status !== 'error' || attempts_left <= 0) {
		return result
	}

	const repaired = await generate_and_check({
		text,
		ai,
		system_instruction: build_repair_instruction({ previous_attempt: phase_1, feedback: collect_feedback(check) }),
		attempts_left: attempts_left - 1,
	})

	return is_at_least_as_good({ candidate: repaired.check, baseline: result.check }) ? repaired : result
}

function is_at_least_as_good({ candidate, baseline }: { candidate: EditorCheckResult, baseline: EditorCheckResult }): boolean {
	const status_difference = STATUS_RANK[candidate.status] - STATUS_RANK[baseline.status]
	if (status_difference !== 0) return status_difference > 0

	return count_errors(candidate) <= count_errors(baseline)
}

function count_errors(check: EditorCheckResult): number {
	return check.tokens
		.flatMap(expand_token)
		.flatMap(token => token.messages)
		.filter(message => message.label === 'error')
		.length
}

function collect_feedback(check: EditorCheckResult): CheckerFeedback[] {
	return check.tokens
		.flatMap(expand_token)
		.flatMap(token => token.messages.map(message => ({ token: token.token, label: message.label, message: message.message, hints: collect_how_to_hints(token) })))
		.filter(feedback => feedback.label === 'error' || feedback.label === 'warning')
}

function collect_how_to_hints(token: CheckerToken): string[] {
	return token.lookup_results
		.flatMap(lookup => lookup.how_to_entries)
		.map(({ structure, pairing, explication }) => [
			structure && `structure "${structure}"`,
			pairing && `pairing "${pairing}"`,
			explication && `explication "${explication}"`,
		].filter(Boolean).join(', '))
		.filter(Boolean)
}

function sanitize(text: string): string {
	return text.replaceAll('\n', ' ')
}

function call_failure(message: string): AiAssistResult {
	return { status: 'error', phase_1: '', notes: [], check: EMPTY_CHECK, message }
}
