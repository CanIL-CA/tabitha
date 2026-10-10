import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { AiClient } from '@tabitha/ai'
import type { CopilotBriefResult, CopilotDiscernResult } from '@tabitha/types'
import type { CopilotSettings, CopilotStep } from '#lib/types.js'

vi.mock('#lib/server/copilot_core.js', () => ({ get_copilot_result: vi.fn() }))
vi.mock('#lib/server/brief/brief.js', () => ({ create_brief_for_verse: vi.fn(), translate_json: vi.fn() }))

const { get_copilot_result } = await import('#lib/server/copilot_core.js')
const { create_brief_for_verse } = await import('#lib/server/brief/brief.js')
const { get_verse_result } = await import('./verse_result')

const reference = { book: 'John', chapter: 3, verse: 16 }

const notes_result: CopilotDiscernResult = { type: 'discern', verse: reference, english_text: 'For God loved...', notes: [] }

const brief_result: CopilotBriefResult = {
	type: 'brief',
	verse: reference,
	lwc_text: 'For God loved...',
	semantic_notes: [],
	tnn_available: true,
	tnn_notes: ['[[a TNN note||English||Indonesian]]'],
	cultural_background: [],
	image_keywords: [],
	consultant_decisions: [],
}

const ai: AiClient = { generate_json: vi.fn(), generate_text: vi.fn() }

function settings_for({ lwc, mode }: Pick<CopilotSettings, 'lwc' | 'mode'>): CopilotSettings {
	return { lwc, mode } as CopilotSettings
}

async function run({ lwc, mode }: Pick<CopilotSettings, 'lwc' | 'mode'>) {
	const steps: CopilotStep[] = []
	const result = await get_verse_result({ reference, settings: settings_for({ lwc, mode }), ai, on_step: step => steps.push(step) })
	return { result, steps }
}

describe('get_verse_result', () => {
	beforeEach(() => {
		vi.mocked(get_copilot_result).mockReset().mockResolvedValue(notes_result)
		vi.mocked(create_brief_for_verse).mockReset().mockResolvedValue(brief_result)
	})

	test('does not create a brief for notes that errored', async () => {
		vi.mocked(get_copilot_result).mockResolvedValueOnce({ type: 'error', verse: reference, error: 'Gemini is down.' })

		const { result } = await run({ lwc: 'Indonesian', mode: 'brief' })

		expect(create_brief_for_verse).not.toHaveBeenCalled()
		expect(result).toMatchObject({ type: 'error' })
	})

	test('returns discern-mode notes without building a brief', async () => {
		const { result, steps } = await run({ lwc: 'Indonesian', mode: 'discern' })

		expect(create_brief_for_verse).not.toHaveBeenCalled()
		expect(result).toBe(notes_result)
		expect(steps).toEqual(['notes'])
	})
})
