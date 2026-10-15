import { afterAll, beforeAll, expect, test } from 'vitest'
import { get_verse_result } from '#lib/server/verse_result.js'
import { EVAL_CASES } from './cases'
import { create_recording_fetch, type RecordedResponse } from './cassette'
import { inputs_path, write_json } from './data'
import { to_call_kind } from './eval_client'
import type { AiClient, GenerateJsonParams } from '@tabitha/ai'
import type { BriefTnnBasedOutput, CopilotLlmOutput } from '#lib/types.js'

// Answers just enough for the pipeline to reach every fetch (Aquifer comes after the notes
// call), so capturing spends nothing on the model.
const EMPTY_NOTES: CopilotLlmOutput = { notes: [] }
const EMPTY_BRIEF: BriefTnnBasedOutput = { section4: { notes: [] }, section5: { cultural: [], background: [] }, section7: { decisions: [] } }

const capture_ai: AiClient = {
	async generate_json<T>({ system_instruction }: GenerateJsonParams): Promise<T> {
		return (to_call_kind(system_instruction) === 'brief' ? EMPTY_BRIEF : EMPTY_NOTES) as T
	},
	async generate_text() {
		return ''
	},
}

const real_fetch = globalThis.fetch
const recorded: RecordedResponse[] = []

beforeAll(() => {
	globalThis.fetch = create_recording_fetch({ real_fetch, recorded })
})

afterAll(() => {
	globalThis.fetch = real_fetch
})

// One at a time, so each case's recorded responses are its own.
test.for(EVAL_CASES)('capture $id', async eval_case => {
	recorded.length = 0
	const result = await get_verse_result({ reference: eval_case.reference, settings: eval_case.settings, ai: capture_ai })
	expect(result.type, result.type === 'error' ? result.error : '').not.toBe('error')

	write_json({
		path: inputs_path(eval_case.id),
		value: { case: eval_case, captured_at: new Date().toISOString(), recorded: [...recorded] },
	})
})
