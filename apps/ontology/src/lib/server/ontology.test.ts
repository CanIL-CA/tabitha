import { describe, expect, it } from 'vitest'
import { merge_how_to_results } from './ontology'
import type { Concept } from '#lib/types.js'
import type { SimplificationHint } from '@tabitha/types'

function concept({ stem = 'baby', sense = 'A', part_of_speech = 'Noun' as Concept['part_of_speech'] } = {}): Concept {
	return {
		id: `${stem}-${sense}-${part_of_speech}`,
		stem,
		sense,
		part_of_speech,
		level: '1',
		categorization: '',
		examples: '',
		gloss: 'a very young child',
		brief_gloss: '',
		occurrences: 3,
		categories: [],
		curated_examples: [],
		curated_examples_raw: '',
		status: 'in ontology',
		how_to_hints: [],
		pending_changes: [],
	}
}

function hint({ stem = 'baby', sense = 'A', part_of_speech = 'Noun', ontology_status = 'in ontology', level = 1 }: Partial<SimplificationHint> = {}): SimplificationHint {
	return {
		stem,
		sense,
		part_of_speech,
		ontology_status,
		level,
		structure: 'structure',
		pairing: 'pairing',
		explication: 'explication',
	}
}

describe('merge_how_to_results', () => {
	it('returns the concepts unchanged when there are no how-to results', () => {
		const concepts = [concept()]

		expect(merge_how_to_results({ concepts, how_to_results: [] })).toEqual(concepts)
	})

	it('attaches a how-to hint to the concept with the same stem, sense and part of speech', () => {
		const matching = hint()

		const [merged] = merge_how_to_results({ concepts: [concept()], how_to_results: [matching] })

		expect(merged.how_to_hints).toEqual([matching])
	})

	it('attaches several hints for one concept in order', () => {
		const first = hint()
		const second = { ...hint(), explication: 'another' }

		const [merged] = merge_how_to_results({ concepts: [concept()], how_to_results: [first, second] })

		expect(merged.how_to_hints).toEqual([first, second])
	})

	it('does not attach a hint that differs in sense or part of speech', () => {
		const merged = merge_how_to_results({
			concepts: [concept()],
			how_to_results: [hint({ sense: 'B' }), hint({ part_of_speech: 'Verb' })],
		})

		expect(merged[0].how_to_hints).toEqual([])
		expect(merged).toHaveLength(3)
	})

	it('adds a placeholder concept for a hint that matches none', () => {
		const orphan = hint({ stem: 'swaddle', sense: 'A', part_of_speech: 'Verb', ontology_status: 'approved', level: 3 })

		const merged = merge_how_to_results({ concepts: [concept()], how_to_results: [orphan] })

		expect(merged).toHaveLength(2)
		expect(merged[1]).toMatchObject({
			id: 'swaddle-A-Verb',
			stem: 'swaddle',
			sense: 'A',
			part_of_speech: 'Verb',
			level: '3',
			status: 'approved',
			gloss: 'Not yet in the Ontology, but will be added in a future update',
			occurrences: 0,
			categories: [],
			pending_changes: [],
			how_to_hints: [orphan],
		})
	})

	it('shows a level of -1 as N/A on a placeholder', () => {
		const merged = merge_how_to_results({ concepts: [], how_to_results: [hint({ level: -1, ontology_status: 'not used' })] })

		expect(merged[0].level).toBe('N/A')
	})

	it.each([
		['approved', 'Not yet in the Ontology, but will be added in a future update'],
		['suggested', 'Not in the Ontology, but has been suggested, and discussion is ongoing'],
		['not used', 'NOT IN THE ONTOLOGY, but suggestions are available'],
		['in ontology', 'Inaccurately marked as "in ontology". Please update the How-To document'],
	] as const)('explains a "%s" placeholder in its gloss', (ontology_status, expected_gloss) => {
		const merged = merge_how_to_results({ concepts: [], how_to_results: [hint({ ontology_status })] })

		expect(merged[0].gloss).toBe(expected_gloss)
	})

	it('falls back to a generic gloss for an unknown status', () => {
		const merged = merge_how_to_results({ concepts: [], how_to_results: [hint({ ontology_status: 'mystery' as SimplificationHint['ontology_status'] })] })

		expect(merged[0].gloss).toBe('Unexpected Ontology Status. Please update the How-To document')
	})

	it('groups several hints for the same missing concept under one placeholder', () => {
		const orphan = hint({ stem: 'swaddle', part_of_speech: 'Verb', ontology_status: 'suggested' })
		const another = { ...orphan, explication: 'another' }

		const merged = merge_how_to_results({ concepts: [], how_to_results: [orphan, another] })

		expect(merged).toHaveLength(1)
		expect(merged[0].how_to_hints).toEqual([orphan, another])
	})
})
