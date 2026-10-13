import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { AiClient } from '@tabitha/ai'
import type { CopilotSettings } from '#lib/types.js'

vi.mock('#lib/fetches.js', () => ({ fetch_encoding: vi.fn(), fetch_target_text: vi.fn() }))

const { fetch_encoding, fetch_target_text } = await import('#lib/fetches.js')
const { CopilotError, get_copilot_result, to_error_result } = await import('./copilot_core')

const verse = { book: 'Luke', chapter: 11, verse: 1 }

describe('to_error_result', () => {
	test('keeps a plain failure retryable by leaving the flag off', () => {
		expect(to_error_result({ verse, error: new Error('Gemini is down.'), fallback_message: 'Unexpected' })).toEqual({ type: 'error', verse, error: 'Gemini is down.' })
	})

	test('keeps a CopilotError retryable unless it says otherwise', () => {
		expect(to_error_result({ verse, error: new CopilotError({ message: 'Aquifer is slow.' }), fallback_message: 'Unexpected' })).toEqual({ type: 'error', verse, error: 'Aquifer is slow.' })
	})

	test('carries over a CopilotError that must not be retried', () => {
		const error = new CopilotError({ message: 'Potential safety issue found in the TNN notes.', retryable: false })

		expect(to_error_result({ verse, error, fallback_message: 'Unexpected' })).toEqual({ type: 'error', verse, error: 'Potential safety issue found in the TNN notes.', retryable: false })
	})

	test('uses the fallback message for something that is not an Error', () => {
		expect(to_error_result({ verse, error: 'boom', fallback_message: 'Unexpected error' })).toEqual({ type: 'error', verse, error: 'Unexpected error' })
	})
})

describe('get_copilot_result', () => {
	const ai = { generate_json: vi.fn(), generate_text: vi.fn() } as AiClient
	const settings = { lwc: 'English', sensitivity: 1, language_profile: {} } as unknown as CopilotSettings

	beforeEach(() => {
		vi.mocked(fetch_encoding).mockReset()
		vi.mocked(fetch_target_text).mockReset()
		vi.spyOn(console, 'error').mockImplementation(() => {})
	})

	test('a verse that does not exist is not worth retrying', async () => {
		vi.mocked(fetch_encoding).mockResolvedValue(null)

		expect(await get_copilot_result({ reference: verse, settings, ai })).toEqual({ type: 'error', verse, error: 'Verse reference Luke 11:1 does not exist.', retryable: false })
	})

	test('a verse with no saved English text is not worth retrying', async () => {
		vi.mocked(fetch_encoding).mockResolvedValue({ encoding: [], glosses: {} } as never)
		vi.mocked(fetch_target_text).mockResolvedValue(null)

		expect(await get_copilot_result({ reference: verse, settings, ai })).toEqual({ type: 'error', verse, error: 'There is no English text saved yet for this verse.', retryable: false })
	})

	test('a verse with no saved text in the LWC is not worth retrying', async () => {
		vi.mocked(fetch_encoding).mockResolvedValue({ encoding: [], glosses: {} } as never)
		vi.mocked(fetch_target_text).mockResolvedValueOnce({ text: 'In the beginning' } as never).mockResolvedValueOnce(null)

		const result = await get_copilot_result({ reference: verse, settings: { ...settings, lwc: 'Indonesian' }, ai })

		expect(result).toEqual({ type: 'error', verse, error: 'There is no Indonesian text saved yet for this verse.', retryable: false })
	})
})
