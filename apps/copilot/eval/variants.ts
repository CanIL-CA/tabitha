export type CallKind = 'notes' | 'brief' | 'translate'

export type ThinkingLevel = 'MINIMAL' | 'LOW' | 'MEDIUM' | 'HIGH'

// What a variant changes, applied around the production pipeline by eval_client.ts, so the
// production code itself stays as it ships. Anything left out keeps today's behavior.
export type Variant = {
	name: string
	description: string
	thinking?: Partial<Record<CallKind, ThinkingLevel>>
	// Swap the brief's system instruction for brief_short_prompt.md.
	short_brief_prompt?: boolean
	// Send the semantic-notes encoding as a JSON object instead of a pre-stringified string.
	encoding_as_object?: boolean
}

export const VARIANTS: Variant[] = [
	{
		name: 'baseline',
		description: "Production settings: gemini-3.5-flash at Vertex's default thinking level (MEDIUM).",
	},
	{
		// Thinking makes even production settings vary run to run, so this is the noise floor that
		// any other variant's differences are read against.
		name: 'baseline-repeat',
		description: 'Production settings again, as a second sample of run-to-run variation.',
	},
	{
		name: 'brief-thinking-low',
		description: 'Brief call at thinking level LOW; notes and translation unchanged.',
		thinking: { brief: 'LOW' },
	},
	{
		name: 'all-thinking-low',
		description: 'Every call at thinking level LOW.',
		thinking: { notes: 'LOW', brief: 'LOW', translate: 'LOW' },
	},
	{
		name: 'encoding-object',
		description: 'Semantic-notes encoding sent as an object, not a string (no double-escaped quotes).',
		encoding_as_object: true,
	},
	{
		name: 'short-brief-prompt',
		description: 'Brief call uses brief_short_prompt.md instead of brief_main_prompt.md.',
		short_brief_prompt: true,
	},
]

export function find_variant(name: string): Variant {
	const variant = VARIANTS.find(candidate => candidate.name === name)
	if (!variant) throw new Error(`Unknown variant "${name}". Known: ${VARIANTS.map(({ name }) => name).join(', ')}`)
	return variant
}
