import { describe, expect, test } from 'vitest'
import { filter_to_encoded_matches } from './phrase_mode'
import type { PhraseMatch } from '#lib/types.js'
import type { SourceEncodedResult } from '@tabitha/types'

function match(id_tertiary: string): PhraseMatch {
	return {
		reference: { type: 'Bible', id_primary: 'Matthew', id_secondary: '3', id_tertiary },
		text: `verse ${id_tertiary}`,
		source_label: 'NIV',
	}
}

function result(has_encoding: boolean): SourceEncodedResult {
	return { reference: { type: 'Bible', id_primary: 'Matthew', id_secondary: '3', id_tertiary: '1' }, has_encoding }
}

describe('filter_to_encoded_matches', () => {
	test('keeps only the matches with an encoding', () => {
		const hits = filter_to_encoded_matches({
			matches: [match('1'), match('2'), match('3')],
			availability: [result(true), result(false), result(true)],
		})

		expect(hits).toEqual([match('1'), match('3')])
	})

	test('pairs answers to matches by position, keeping each verse with its own', () => {
		const hits = filter_to_encoded_matches({
			matches: [match('1'), match('2')],
			availability: [result(false), result(true)],
		})

		expect(hits).toEqual([match('2')])
	})

	// Not a response `get_verse_encoding_availability` actually produces today -- it always
	// returns one result per reference -- but this pins the function's own contract for if that
	// ever changes: a shorter array should only ever under-promise, never misattribute an answer.
	test('drops verses beyond a short response rather than assuming they are encoded', () => {
		const hits = filter_to_encoded_matches({
			matches: [match('1'), match('2'), match('3')],
			availability: [result(true)],
		})

		expect(hits).toEqual([match('1')])
	})

	test('drops everything when the lookup returned nothing at all', () => {
		const hits = filter_to_encoded_matches({
			matches: [match('1'), match('2')],
			availability: null,
		})

		expect(hits).toEqual([])
	})

	test('returns nothing for no matches', () => {
		expect(filter_to_encoded_matches({ matches: [], availability: [] })).toEqual([])
	})
})
