import { describe, expect, it } from 'vitest'
import { merge_how_to_results } from './ontology'
import type { Concept } from '#lib/types.js'
import type { SimplificationHint } from '@tabitha/types'

function make_concept(overrides: Partial<Concept> = {}): Concept {
	return {
		id: '1',
		stem: 'love',
		sense: 'A',
		part_of_speech: 'Verb',
		level: '1',
		categorization: '',
		examples: '',
		gloss: 'to love',
		brief_gloss: '',
		occurrences: 0,
		categories: [],
		curated_examples: [],
		curated_examples_raw: '',
		status: 'in ontology',
		how_to_hints: [],
		pending_changes: [],
		...overrides,
	}
}

function make_hint(overrides: Partial<SimplificationHint> = {}): SimplificationHint {
	return {
		stem: 'friendship',
		sense: 'A',
		part_of_speech: 'Noun',
		structure: '',
		pairing: '',
		explication: '',
		ontology_status: 'suggested',
		level: 1,
		...overrides,
	}
}

describe('merge_how_to_results', () => {
	it('attaches a how-to hint to the matching existing concept instead of creating a duplicate', () => {
		const concept = make_concept()
		const hint = make_hint({ stem: 'love', sense: 'A', part_of_speech: 'Verb' })

		const merged = merge_how_to_results({ concepts: [concept], how_to_results: [hint] })

		expect(merged).toHaveLength(1)
		expect(merged[0].how_to_hints).toEqual([hint])
	})

	it('creates a new synthetic concept for a hint with no matching existing concept', () => {
		const hint = make_hint({ stem: 'friendship', sense: 'A', part_of_speech: 'Noun', ontology_status: 'suggested' })

		const merged = merge_how_to_results({ concepts: [], how_to_results: [hint] })

		expect(merged).toHaveLength(1)
		expect(merged[0].id).toBe('friendship-A-Noun')
		expect(merged[0].status).toBe('suggested')
		expect(merged[0].how_to_hints).toEqual([hint])
	})

	it('maps each known ontology_status to its expected placeholder gloss', () => {
		const statuses: SimplificationHint['ontology_status'][] = ['approved', 'suggested', 'not used', 'in ontology']

		const merged = merge_how_to_results({ concepts: [], how_to_results: statuses.map((ontology_status, i) => make_hint({ stem: `word${i}`, ontology_status })) })

		expect(merged.map(c => c.gloss)).toEqual([
			'Not yet in the Ontology, but will be added in a future update',
			'Not in the Ontology, but has been suggested, and discussion is ongoing',
			'NOT IN THE ONTOLOGY, but suggestions are available',
			'Inaccurately marked as "in ontology". Please update the How-To document',
		])
	})

	it('falls back to a generic message for an unrecognized ontology_status', () => {
		const hint = make_hint({ ontology_status: 'unknown' })

		const [merged] = merge_how_to_results({ concepts: [], how_to_results: [hint] })

		expect(merged.gloss).toBe('Unexpected Ontology Status. Please update the How-To document')
	})

	it('reports N/A as the level for a synthetic concept whose hint level is -1', () => {
		const hint = make_hint({ level: -1 })

		const [merged] = merge_how_to_results({ concepts: [], how_to_results: [hint] })

		expect(merged.level).toBe('N/A')
	})

	it('leaves concepts with no matching hint untouched, with an empty how_to_hints list', () => {
		const concept = make_concept({ stem: 'peace' })

		const merged = merge_how_to_results({ concepts: [concept], how_to_results: [] })

		expect(merged).toEqual([concept])
	})
})
