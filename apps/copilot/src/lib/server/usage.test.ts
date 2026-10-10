import { describe, expect, it } from 'vitest'
import { default_settings } from '#lib/lookups.js'
import { get_customized_profile_fields, to_copilot_run_event } from './usage'
import type { CopilotResult } from '@tabitha/types'

const verse = { book: 'John', chapter: 3, verse: 16 }
const error_result = { type: 'error', verse, error: 'No English text for this verse' } as CopilotResult
const ok_result = { type: 'brief', verse } as CopilotResult

describe('get_customized_profile_fields', () => {
	it('is empty for the default profile', () => {
		expect(get_customized_profile_fields(default_settings.language_profile)).toEqual([])
	})

	it('lists only the fields that differ from the defaults, including array values', () => {
		const profile = { ...default_settings.language_profile, honorifics: true, noun_number: ['dual'] }

		expect(get_customized_profile_fields(profile)).toEqual(['noun_number', 'honorifics'])
	})
})

describe('to_copilot_run_event', () => {
	it('keeps the error reason for a single verse', () => {
		const event = to_copilot_run_event({ caller: 'same-origin', run: 'verse', book: 'John', settings: default_settings, verse_count: 1, results: [error_result] })

		expect(event).toMatchObject({ mode: 'brief', lwc: 'English', sensitivity: 1, verse_count: 1, error_count: 1, error: 'No English text for this verse' })
	})

	it('counts a batch\'s errors without a single reason', () => {
		const event = to_copilot_run_event({ caller: 'same-origin', run: 'batch', book: 'John', settings: default_settings, verse_count: 3, results: [ok_result, error_result, error_result] })

		expect(event).toMatchObject({ run: 'batch', verse_count: 3, error_count: 2, error: undefined })
	})
})
