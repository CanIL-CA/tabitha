import { check_input_safety, type AiClient } from '@tabitha/ai'
import { CopilotError } from './copilot_core'
import system_instruction_template from './semantic_notes_prompt.md?raw'
import type { CopilotLlmInput, CopilotLlmOutput } from '$lib/types'

// The AI Gateway's prompt-injection guardrail is off gateway-wide (see @tabitha/ai's input_guard
// and ADR 0007), so this is a local, best-effort substitute scoped to the translator-authored
// verse text here (english_text/lwc_text) -- the same kind of content, and the same length
// profile (a single verse), as apps/editor's ai-assist textarea.
const MAX_VERSE_TEXT_LENGTH = 2000

// Longer than the AI Gateway's 1-hour default (tools/gateway/config.ts) -- workshop settings
// often re-check or regenerate the same verse's notes well past an hour, and this call is fully
// deterministic (fixed model/temperature/seed, JSON-schema output, no per-request-unique data),
// so a stale cache entry is never a correctness concern, only a cost one.
const ONE_WEEK_IN_SECONDS = 7 * 24 * 60 * 60

export async function get_semantic_notes({ llm_input, ai }: { llm_input: CopilotLlmInput, ai: AiClient }): Promise<CopilotLlmOutput> {

	const translate_tbta_text = llm_input.output_language !== 'English' && !llm_input.lwc_text

	if (!translate_tbta_text && llm_input.triggers.length === 0) {
		return { notes: [], lwc_text: llm_input.lwc_text }
	}

	const safety_issue = check_verse_text_safety(llm_input.english_text) ?? (llm_input.lwc_text ? check_verse_text_safety(llm_input.lwc_text) : undefined)
	if (safety_issue) {
		console.warn(`copilot: semantic-notes rejected verse text: ${safety_issue}`)
		throw new CopilotError('Potential safety issue found in the English/LWC text.')
	}

	const system_instruction = system_instruction_template.replace('{{TRANSLATE_OR_CITE_INSTRUCTION}}', () => translate_tbta_text
		? 'Translate the english_text into the output_language and return it as the lwc_text. Maintain anything within <<>>. Use that resulting text when citing words or phrases in your notes.'
		: 'When citing words or phrases in your notes, always use the form that appears in the provided lwc_text.')

	let output: CopilotLlmOutput
	try {
		output = await ai.generate_json<CopilotLlmOutput>({
			contents: llm_input,
			system_instruction,
			schema: {
				'type': 'object',
				'properties': {
					'notes': {
						'type': 'array',
						'items': {
							'type': 'object',
							'properties': {
								'meaning': {
									'type': 'string',
									'description': 'The interpreted meaning represented by the trigger, in a single sentence.',
								},
								'check': {
									'type': 'string',
									'description': 'A note to the MTT to consider whether their translation carries the above meaning.',
								},
								'quoted_text': {
									'type': 'string',
									'description': 'The part of the text that relates to the note with at least a few words of context, quoted from the lwc_text.',
								},
								'trigger': {
									'type': 'object',
									'properties': {
										'name': {
											'type': 'string',
											'description': 'The name of the trigger that this note relates to.',
										},
										'node_id': {
											'type': 'string',
											'description': 'The node_id from the trigger that this note relates to.',
										},
									},
									'required': ['name', 'node_id'],
								},
							},
							'required': ['meaning', 'check', 'quoted_text', 'trigger'],
						},
					},
					...translate_tbta_text ? {
						'lwc_text': {
							'type': 'string',
							'description': `the english_text translated from English into ${llm_input.output_language}`,
						},
					} : {},
				},
				'required': ['notes'],
			},
			config: {
				httpOptions: { headers: { 'cf-aig-cache-ttl': String(ONE_WEEK_IN_SECONDS) } },
			},
		})
	} catch (error) {
		const message = error instanceof Error ? error.message : `${error}`
		throw new CopilotError(`Error generating semantic notes: ${message}`)
	}

	return {
		notes: output.notes.map(({ meaning, check, quoted_text, trigger }) => ({ meaning: postprocess(meaning), check: postprocess(check), quoted_text, trigger })),
		lwc_text: translate_tbta_text ? output.lwc_text : llm_input.lwc_text,
	}
}

function postprocess(caution: string) {
	// remove senses in case the LLM included it
	return caution?.replaceAll(/ \(\w+-[A-Z]\)/g, '').replaceAll(/-[A-Z](\W)/g, '$1')
}

function check_verse_text_safety(text: string): string | undefined {
	return check_input_safety(text, {
		max_length: MAX_VERSE_TEXT_LENGTH,
		too_long_message: `Verse text is too long (${text.length} characters, max ${MAX_VERSE_TEXT_LENGTH}).`,
		suspicious_message: 'Verse text looks like it might contain instructions rather than scripture.',
		log_label: 'copilot: semantic-notes',
	})
}
