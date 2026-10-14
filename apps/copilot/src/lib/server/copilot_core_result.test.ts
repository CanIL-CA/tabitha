import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { AiClient } from '@tabitha/ai'
import type { CopilotLlmOutput, CopilotSettings, LanguageProfile } from '#lib/types.js'

// Fetching the encoding and target text is the network boundary; everything after it runs for real
vi.mock('#lib/fetches.js', () => ({ fetch_encoding: vi.fn(), fetch_target_text: vi.fn() }))

const { fetch_encoding, fetch_target_text } = await import('#lib/fetches.js')
const { get_copilot_result } = await import('./copilot_core')

const reference = { book: 'Luke', chapter: 11, verse: 1 }

const language_profile: LanguageProfile = {
	multiple_past: false,
	multiple_future: false,
	noun_number: [],
	noun_proximity: [],
	noun_clusivity: false,
	as_third_handling: 'third',
	modifier_degree: [],
	passive: 'agent_allowed',
	rhetorical_questions: true,
	honorifics: false,
	speech_formula_position: 'before',
}

function settings_with({ sensitivity }: { sensitivity: number | string }): CopilotSettings {
	return { language_profile, lwc: 'English', mtt_level: 'grade5', sensitivity, mode: 'discern', show_note_sources: true, show_english: true } as CopilotSettings
}

function fake_ai({ output, failure }: { output?: CopilotLlmOutput, failure?: Error }): AiClient {
	return {
		generate_json: async <T>() => {
			if (failure) throw failure
			return output as T
		},
		generate_text: async () => '',
	}
}

// A past-tense verb: default weight 2 for "Historic Past"
const encoding = {
	encoding: [{ category: 'Clause', children: [{ category: 'Verb', concept: 'pray-01', features: { Time: 'Historic Past' } }] }],
	glosses: {},
}

beforeEach(() => {
	vi.mocked(fetch_encoding).mockResolvedValue(encoding as never)
	vi.mocked(fetch_target_text).mockResolvedValue({ text: 'He was praying.', ideal: 'He prayed.' } as never)
	vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('get_copilot_result with an encoding that yields a note', () => {
	const note = { meaning: 'It happened long ago.', check: 'Check the tense.', quoted_text: 'prayed', trigger: { name: 'TAMP', node_id: '0.0' } }

	test('returns the notes with each one tied to its full trigger data', async () => {
		const result = await get_copilot_result({ reference, settings: settings_with({ sensitivity: 2 }), ai: fake_ai({ output: { notes: [note] } }) })

		expect(result).toMatchObject({ type: 'discern', verse: reference, english_text: 'He prayed.' })
		if (result.type !== 'discern') throw new Error('expected a discern result')
		expect(result.notes).toHaveLength(1)
		expect(result.notes[0].trigger).toMatchObject({ name: 'TAMP', node_id: '0.0', weight: 2 })
		expect(result.notes[0].trigger.flags[0]).toMatchObject({ name: 'Verb Time', value: 'Historic Past' })
	})

	test('treats a sensitivity that arrives as a string like a number', async () => {
		const result = await get_copilot_result({ reference, settings: settings_with({ sensitivity: '2' }), ai: fake_ai({ output: { notes: [note] } }) })

		expect(result.type === 'discern' && result.notes).toHaveLength(1)
	})

	test('selects only triggers at or above the sensitivity, so nothing weaker is sent for a note', async () => {
		const failing_ai = fake_ai({ failure: new Error('the model should not be asked') })

		const result = await get_copilot_result({ reference, settings: settings_with({ sensitivity: 5 }), ai: failing_ai })

		expect(result).toMatchObject({ type: 'discern', notes: [] })
	})

	test('reports a model failure as an error result for the verse', async () => {
		const result = await get_copilot_result({ reference, settings: settings_with({ sensitivity: 2 }), ai: fake_ai({ failure: new Error('Gemini is down.') }) })

		expect(result).toMatchObject({ type: 'error', verse: reference, error: expect.stringContaining('Gemini is down.') })
	})

	test('falls back to the plain English text when there is no ideal text', async () => {
		vi.mocked(fetch_target_text).mockResolvedValue({ text: 'He was praying.' } as never)

		const result = await get_copilot_result({ reference, settings: settings_with({ sensitivity: 5 }), ai: fake_ai({ output: { notes: [] } }) })

		expect(result).toMatchObject({ type: 'discern', english_text: 'He was praying.' })
	})
})
