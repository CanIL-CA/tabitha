import { describe, expect, it } from 'vitest'
import { CONCEPT_FILTERS } from './filters'
import type { Concept } from '#lib/types.js'

function make_concept(overrides: Partial<Concept> = {}): Concept {
	return {
		id: 'love-A-Verb',
		stem: 'love',
		sense: 'A',
		part_of_speech: 'Verb',
		level: '0',
		categorization: '',
		examples: '',
		curated_examples: [],
		curated_examples_raw: '',
		gloss: 'to care deeply',
		brief_gloss: '',
		occurrences: 10,
		status: 'in ontology',
		categories: [],
		how_to_hints: [],
		pending_changes: [],
		...overrides,
	}
}

describe('filters', () => {
	it('IS_IN_ONTOLOGY checks for in ontology status', () => {
		expect(CONCEPT_FILTERS.IS_IN_ONTOLOGY(make_concept({ status: 'in ontology' }))).toBe(true)
		expect(CONCEPT_FILTERS.IS_IN_ONTOLOGY(make_concept({ status: 'suggested' }))).toBe(false)
		expect(CONCEPT_FILTERS.IS_IN_ONTOLOGY(make_concept({ status: 'approved' }))).toBe(false)
	})

	it('IS_OR_WILL_BE_IN_ONTOLOGY checks for approved or in ontology status', () => {
		expect(CONCEPT_FILTERS.IS_OR_WILL_BE_IN_ONTOLOGY(make_concept({ status: 'in ontology' }))).toBe(true)
		expect(CONCEPT_FILTERS.IS_OR_WILL_BE_IN_ONTOLOGY(make_concept({ status: 'approved' }))).toBe(true)
		expect(CONCEPT_FILTERS.IS_OR_WILL_BE_IN_ONTOLOGY(make_concept({ status: 'suggested' }))).toBe(false)
		expect(CONCEPT_FILTERS.IS_OR_WILL_BE_IN_ONTOLOGY(make_concept({ status: 'not used' }))).toBe(false)
	})

	it('IS_COMPLEX checks for level 2 or 3', () => {
		expect(CONCEPT_FILTERS.IS_COMPLEX(make_concept({ level: '2' }))).toBe(true)
		expect(CONCEPT_FILTERS.IS_COMPLEX(make_concept({ level: '3' }))).toBe(true)
		expect(CONCEPT_FILTERS.IS_COMPLEX(make_concept({ level: '0' }))).toBe(false)
		expect(CONCEPT_FILTERS.IS_COMPLEX(make_concept({ level: '1' }))).toBe(false)
		expect(CONCEPT_FILTERS.IS_COMPLEX(make_concept({ level: '4' }))).toBe(false)
	})
})
