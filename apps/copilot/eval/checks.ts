import type { CopilotResult } from '@tabitha/types'
import type { EvalCall } from './eval_client'

// The automatic layer of the eval: cheap structural checks that catch a variant breaking
// something. Whether a variant is as good is left to the human rubric.

export type SectionCounts = {
	semantic_notes: number
	tnn_notes: number
	cultural_background: number
	consultant_decisions: number
}

export type UsageTotals = {
	calls: number
	prompt_tokens: number
	output_tokens: number
	thought_tokens: number
	cached_tokens: number
	// Billed output: Vertex bills thought tokens as output.
	billed_output_tokens: number
	duration_ms: number
}

export type CaseComparison = {
	same_note_triggers: boolean
	counts: { baseline: SectionCounts, variant: SectionCounts }
	// Share of distinct words the two outputs have in common (0 to 1).
	word_overlap: number
	usage: { baseline: UsageTotals, variant: UsageTotals }
	warnings: string[]
}

// Below this, the variant said something substantially different, worth a reviewer's look first.
const LOW_WORD_OVERLAP = 0.35

const EMPTY_COUNTS: SectionCounts = { semantic_notes: 0, tnn_notes: 0, cultural_background: 0, consultant_decisions: 0 }

export function compare_case({ baseline, variant }: { baseline: { result: CopilotResult, calls: EvalCall[] }, variant: { result: CopilotResult, calls: EvalCall[] } }): CaseComparison {
	const counts = { baseline: section_counts(baseline.result), variant: section_counts(variant.result) }
	const same_note_triggers = same_items({ a: note_triggers(baseline.result), b: note_triggers(variant.result) })
	const word_overlap = jaccard({ a: words(output_text(baseline.result)), b: words(output_text(variant.result)) })

	const warnings = [
		...variant.result.type === 'error' ? [`variant failed: ${variant.result.error}`] : [],
		...same_note_triggers ? [] : ['semantic notes cover different triggers'],
		...(Object.keys(EMPTY_COUNTS) as (keyof SectionCounts)[])
			.filter(section => counts.baseline[section] !== counts.variant[section])
			.map(section => `${section.replaceAll('_', ' ')}: ${counts.baseline[section]} → ${counts.variant[section]}`),
		...word_overlap < LOW_WORD_OVERLAP ? [`low word overlap (${word_overlap.toFixed(2)})`] : [],
	]

	return {
		same_note_triggers,
		counts,
		word_overlap,
		usage: { baseline: usage_totals(baseline.calls), variant: usage_totals(variant.calls) },
		warnings,
	}
}

export function section_counts(result: CopilotResult): SectionCounts {
	if (result.type === 'error') return EMPTY_COUNTS
	if (result.type === 'discern') return { ...EMPTY_COUNTS, semantic_notes: result.notes.length }
	return {
		semantic_notes: result.semantic_notes.length,
		tnn_notes: result.tnn_notes.length,
		cultural_background: result.cultural_background.length,
		consultant_decisions: result.consultant_decisions.length,
	}
}

export function usage_totals(calls: EvalCall[]): UsageTotals {
	const sum = (pick: (call: EvalCall) => number) => calls.reduce((total, call) => total + pick(call), 0)
	return {
		calls: calls.length,
		prompt_tokens: sum(call => call.prompt_tokens),
		output_tokens: sum(call => call.output_tokens),
		thought_tokens: sum(call => call.thought_tokens),
		cached_tokens: sum(call => call.cached_tokens),
		billed_output_tokens: sum(call => call.output_tokens + call.thought_tokens),
		duration_ms: sum(call => call.duration_ms),
	}
}

function note_triggers(result: CopilotResult): string[] {
	if (result.type === 'error') return []
	const notes = result.type === 'discern' ? result.notes : result.semantic_notes
	// The pipeline asserts a match, so a trigger the model made up arrives as undefined.
	return notes.map(note => note.trigger ? `${note.trigger.name}@${note.trigger.node_id}` : 'unmatched')
}

function output_text(result: CopilotResult): string {
	if (result.type === 'error') return ''
	const notes = result.type === 'discern' ? result.notes : result.semantic_notes
	const note_text = notes.flatMap(note => [note.meaning, note.check])
	if (result.type === 'discern') return note_text.join(' ')
	return [
		...note_text,
		...result.tnn_notes,
		...result.cultural_background.flatMap(entry => [entry.term, entry.summary]),
		...result.consultant_decisions.flatMap(decision => [decision.status, decision.text]),
	].join(' ')
}

function words(text: string): Set<string> {
	return new Set(text.toLowerCase().match(/\p{L}+/gu) ?? [])
}

function jaccard({ a, b }: { a: Set<string>, b: Set<string> }): number {
	if (!a.size && !b.size) return 1
	const shared = [...a].filter(word => b.has(word)).length
	return shared / (a.size + b.size - shared)
}

function same_items({ a, b }: { a: string[], b: string[] }): boolean {
	const sorted_b = b.toSorted()
	return a.length === b.length && a.toSorted().every((item, index) => item === sorted_b[index])
}
