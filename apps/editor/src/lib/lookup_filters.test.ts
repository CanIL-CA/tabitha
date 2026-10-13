import { describe, test, expect } from 'vitest'
import { LOOKUP_FILTERS } from './lookup_filters'
import type { LookupResult } from '#lib/types.js'
import type { PartOfSpeech } from '@tabitha/types'

describe('LOOKUP_FILTERS', () => {
	test('IS_IN_ONTOLOGY', () => {
		expect(LOOKUP_FILTERS.IS_IN_ONTOLOGY({ ontology_status: 'in ontology' })).toBe(true)
		expect(LOOKUP_FILTERS.IS_IN_ONTOLOGY({ ontology_status: 'approved' })).toBe(false)
		expect(LOOKUP_FILTERS.IS_IN_ONTOLOGY({ ontology_status: 'not used' })).toBe(false)
	})

	test('IS_OR_WILL_BE_IN_ONTOLOGY', () => {
		expect(LOOKUP_FILTERS.IS_OR_WILL_BE_IN_ONTOLOGY({ ontology_status: 'in ontology' })).toBe(true)
		expect(LOOKUP_FILTERS.IS_OR_WILL_BE_IN_ONTOLOGY({ ontology_status: 'approved' })).toBe(true)
		expect(LOOKUP_FILTERS.IS_OR_WILL_BE_IN_ONTOLOGY({ ontology_status: 'not used' })).toBe(false)
	})

	test('IS_PART_OF_SPEECH', () => {
		const filter = LOOKUP_FILTERS.IS_PART_OF_SPEECH('Noun')
		// sometimes user-input parts of speech don't match the expected case. but everything code-controlled must
		expect(filter({ part_of_speech: 'noun' as PartOfSpeech })).toBe(true)
		expect(filter({ part_of_speech: 'Verb' })).toBe(false)
	})

	test('IS_LEVEL and complexity helpers', () => {
		const level1_filter = LOOKUP_FILTERS.IS_LEVEL(1)
		expect(level1_filter({ level: 1 })).toBe(true)
		expect(level1_filter({ level: 2 })).toBe(false)

		expect(LOOKUP_FILTERS.IS_LEVEL_SIMPLE({ level: 0 })).toBe(true)
		expect(LOOKUP_FILTERS.IS_LEVEL_SIMPLE({ level: 1 })).toBe(true)
		expect(LOOKUP_FILTERS.IS_LEVEL_SIMPLE({ level: 2 })).toBe(false)

		expect(LOOKUP_FILTERS.IS_LEVEL_COMPLEX({ level: 2 })).toBe(true)
		expect(LOOKUP_FILTERS.IS_LEVEL_COMPLEX({ level: 3 })).toBe(true)
		expect(LOOKUP_FILTERS.IS_LEVEL_COMPLEX({ level: 1 })).toBe(false)
	})

	test('MATCHES_LOOKUP and MATCHES_SENSE', () => {
		const lookup_filter = LOOKUP_FILTERS.MATCHES_LOOKUP({ stem: 'dog', part_of_speech: 'Noun' })
		expect(lookup_filter({ stem: 'dog', part_of_speech: 'Noun' })).toBe(true)
		expect(lookup_filter({ stem: 'dog', part_of_speech: 'Verb' })).toBe(false)

		const sense_filter = LOOKUP_FILTERS.MATCHES_SENSE({ stem: 'go', sense: 'A' })
		expect(sense_filter({ stem: 'go', sense: 'A' })).toBe(true)
		expect(sense_filter({ stem: 'go', sense: 'B' })).toBe(false)
	})

	test('HAS_MISSING_ARGUMENT and HAS_EXTRA_ARGUMENT', () => {
		const missing_lookup = {
			case_frame: {
				result: {
					missing_arguments: ['patient'],
					extra_arguments: [{ role_tag: 'agent' }],
				},
			},
		} as unknown as LookupResult

		expect(LOOKUP_FILTERS.HAS_MISSING_ARGUMENT('patient')(missing_lookup)).toBe(true)
		expect(LOOKUP_FILTERS.HAS_MISSING_ARGUMENT('agent')(missing_lookup)).toBe(false)

		expect(LOOKUP_FILTERS.HAS_EXTRA_ARGUMENT('agent')(missing_lookup)).toBe(true)
		expect(LOOKUP_FILTERS.HAS_EXTRA_ARGUMENT('patient')(missing_lookup)).toBe(false)
	})
})
