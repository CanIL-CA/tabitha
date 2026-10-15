import { describe, expect, it } from 'vitest'
import type { OntologyResult } from '@tabitha/types'
import { group_senses_by_concept, type SensesByConcept } from './ontology_senses'
import { OntologySenses } from './ontology_senses_context.svelte'

function sense({ stem, sense = 'A', gloss = '' }: { stem: string, sense?: string, gloss?: string }): OntologyResult {
	return { stem, sense, part_of_speech: 'Verb', level: '1', gloss, categorization: '', categories: [], status: 'in ontology', how_to_hints: [] }
}

const glosses = (results: OntologyResult[]) => results.map(({ gloss }) => gloss)

describe('OntologySenses', () => {
	it("answers with the page's loaded senses", () => {
		const ontology_senses = new OntologySenses(() => group_senses_by_concept([sense({ stem: 'make', gloss: 'loaded' })]))

		expect(glosses(ontology_senses.senses_of({ stem: 'make', part_of_speech: 'Verb' }))).toEqual(['loaded'])
	})

	it('adds the senses of a stem picked after the page loaded', () => {
		const ontology_senses = new OntologySenses(() => ({}))

		ontology_senses.remember([sense({ stem: 'build', sense: 'A' }), sense({ stem: 'build', sense: 'B' })])

		expect(ontology_senses.senses_of({ stem: 'build', part_of_speech: 'Verb' })).toHaveLength(2)
	})

	it("prefers remembered senses over the page's for the same stem", () => {
		const ontology_senses = new OntologySenses(() => group_senses_by_concept([sense({ stem: 'make', gloss: 'loaded' })]))

		ontology_senses.remember([sense({ stem: 'make', gloss: 'remembered' })])

		expect(glosses(ontology_senses.senses_of({ stem: 'make', part_of_speech: 'Verb' }))).toEqual(['remembered'])
	})

	it('follows the load data when the page navigates to another verse', () => {
		let loaded: SensesByConcept = group_senses_by_concept([sense({ stem: 'make' })])
		const ontology_senses = new OntologySenses(() => loaded)

		loaded = group_senses_by_concept([sense({ stem: 'create' })])

		expect(ontology_senses.senses_of({ stem: 'make', part_of_speech: 'Verb' })).toEqual([])
		expect(ontology_senses.senses_of({ stem: 'create', part_of_speech: 'Verb' })).toHaveLength(1)
	})

	it("finds a concept's own sense", () => {
		const ontology_senses = new OntologySenses(() => group_senses_by_concept([sense({ stem: 'make', sense: 'B', gloss: 'make someone do something' })]))

		expect(ontology_senses.sense_of({ stem: 'make', sense: 'B', part_of_speech: 'Verb' }).gloss).toBe('make someone do something')
	})
})
