import { get_semantic_notes } from '#lib/server/semantic_notes.js'
import { default_target_audience } from '#lib/lookups.js'
import { fetch_encoding, fetch_target_text } from '#lib/fetches.js'
import { extract_flags } from './flag_extraction/flag_extraction'
import { assign_flag_weights } from './flag_weighting/flag_weighting'
import { collect_triggers, triggers_match } from './triggers'
import type { AiClient } from '@tabitha/ai'
import type { VerseReference, SourceSimpleJsonResult, SourceSimpleJsonEntity } from '@tabitha/types'
import type { CopilotDiscernResult, CopilotErrorResult, CopilotTriggerData } from '@tabitha/types/copilot'
import type { CopilotSettings, CopilotEncodingEntity, CopilotLlmInput, IndexStack } from '#lib/types.js'

export async function get_copilot_result({ reference, settings, ai }: { reference: VerseReference, settings: CopilotSettings, ai: AiClient }): Promise<CopilotDiscernResult | CopilotErrorResult> {
	const ref_display = `${reference.book} ${reference.chapter}:${reference.verse}`

	const encoding = await fetch_encoding(reference)
	if (!encoding) {
		console.error(`Error fetching encoding for ${ref_display}`)
		return error_result(`Verse reference ${ref_display} does not exist.`)
	}

	const english = await fetch_target_text({ reference, project: 'English', preferred_audience: default_target_audience['English'] })
	if (!english) {
		console.error(`Error fetching english text for ${ref_display}`)
		return error_result('There is no English text saved yet for this verse.')
	}
	const english_text = english.ideal || english.text

	const lwc_text_result = settings.lwc !== 'English'
		? await fetch_target_text({ reference, project: settings.lwc, preferred_audience: default_target_audience[settings.lwc] || 'Unchurched Adults' })
		: english

	if (!lwc_text_result) {
		console.error(`Error fetching ${settings.lwc} text for ${ref_display}`)
		return error_result(`There is no ${settings.lwc} text saved yet for this verse.`)
	}
	const lwc_text = lwc_text_result.ideal || lwc_text_result.text

	const flags = extract_flags(encoding.encoding)
	const weighted_flags = assign_flag_weights({ flags, settings }).filter(({ weight }) => weight > 0)
	const all_triggers = collect_triggers({ flags: weighted_flags, language_profile: settings.language_profile })
	const sorted_triggers = all_triggers.toSorted((t1, t2) => t1.node_id.localeCompare(t2.node_id))

	const sensitivity = Number(settings.sensitivity)	// in case it somehow gets converted to a string somewhere
	const selected_triggers = sorted_triggers.filter(t => t.weight >= sensitivity)

	const llm_input: CopilotLlmInput = {
		verse: `${reference.book} ${reference.chapter}:${reference.verse}`,
		output_language: settings.lwc ?? 'English',
		prose_level: settings.mtt_level,
		tbta_encoding: preprocess_encoding(encoding),
		english_text,
		lwc_text: settings.lwc === 'English' ? undefined : lwc_text,
		triggers: selected_triggers,
	}

	try {
		const llm_output = await get_semantic_notes({ llm_input, ai })
		const triggers = llm_input.triggers.map<CopilotTriggerData>(({ name, node_id, flags, weight }) => ({ name, node_id, flags, weight }))
		const notes = llm_output.notes.map(({ meaning, check, quoted_text, trigger }) => ({
			meaning,
			check,
			quoted_text,
			trigger: triggers.find(trigger_data => triggers_match({ t1: trigger, t2: trigger_data }))!,
		}))
		return {
			type: 'discern',
			verse: reference,
			english_text,
			lwc_text: llm_output.lwc_text,
			notes,
		}

	} catch (error) {
		console.error(`Error for ${ref_display}: ${error instanceof Error ? error.message : error}`)
		return error_result(`${error instanceof Error ? error.message : 'Unexpected error fetching notes'}`)
	}
	
	function error_result(error: string): CopilotErrorResult {
		return { type: 'error', verse: reference, error }
	}
}

export class CopilotError extends Error {
	override name = 'CopilotError'
}

function preprocess_encoding(encoding: SourceSimpleJsonResult): string {
	const encoding_w_ids: SourceSimpleJsonResult = {
		encoding: add_node_ids(encoding.encoding),
		glosses: encoding.glosses,
	}
	return JSON.stringify(encoding_w_ids)
		.replaceAll('"be-G"', '"be-for-G"')
		.replaceAll('"be-I"', '"be-with-I"')
		.replaceAll('"be-P"', '"be-about-P"')
		.replaceAll('"be-Q"', '"be-made-of-Q"')
		.replaceAll('"be-R"', '"be-part-of-R"')
		.replaceAll('"be-T"', '"be-from-T"')
		.replaceAll('"be-U"', '"be-like-U"')
		.replaceAll('"be-W"', '"be-in-W"')
		.replaceAll('"become-G"', '"become-like-G"')
}

function add_node_ids(encoding: SourceSimpleJsonEntity[]): CopilotEncodingEntity[] {
	const stack: IndexStack = []
	function add_trace({ node, index }: {
		node: SourceSimpleJsonEntity
		index: number
	}): CopilotEncodingEntity {
		stack.push(index)
		const node_id = stack.join('.')
		if (node.children) {
			node.children = node.children.map((child, child_index) => add_trace({ node: child, index: child_index }))
		}
		stack.pop()
		return { ...node, node_id }
	}
	return encoding.map((node, index) => add_trace({ node, index }))
}