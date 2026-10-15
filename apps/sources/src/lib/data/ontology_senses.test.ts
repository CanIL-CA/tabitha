import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ConceptKey, OntologyResult } from '@tabitha/types'
import type { PageSourceEntity } from '#lib/types.js'
import { find_sense, find_senses, get_page_concepts, group_senses_by_concept, load_ontology_senses } from './ontology_senses'

function sense({ stem, sense = 'A', part_of_speech = 'Verb', gloss = '', status = 'in ontology' }: Partial<OntologyResult> & { stem: string }): OntologyResult {
	return { stem, sense, part_of_speech, level: '1', gloss, categorization: '', categories: [], status, how_to_hints: [] }
}

// Only the concept fields matter here; the rest of an entity is parsing detail these functions never read
function entity({ concept = null, pairing_concept = null }: { concept?: ConceptKey | null, pairing_concept?: ConceptKey | null }): PageSourceEntity {
	return { concept, pairing_concept } as PageSourceEntity
}

describe('group_senses_by_concept', () => {
	it('groups senses by stem and part of speech, keeping only those in the ontology', () => {
		const senses = group_senses_by_concept([
			sense({ stem: 'make', sense: 'A' }),
			sense({ stem: 'make', sense: 'B' }),
			sense({ stem: 'make', sense: 'C', status: 'suggested' }),
			sense({ stem: 'make', sense: 'A', part_of_speech: 'Noun' }),
		])

		expect(find_senses({ senses, concept: { stem: 'make', part_of_speech: 'Verb' } }).map(({ sense }) => sense)).toEqual(['A', 'B'])
		expect(find_senses({ senses, concept: { stem: 'make', part_of_speech: 'Noun' } }).map(({ sense }) => sense)).toEqual(['A'])
	})

	it('keeps one copy of a sense returned for two differently cased terms', () => {
		const senses = group_senses_by_concept([sense({ stem: 'God' }), sense({ stem: 'God' })])

		expect(find_senses({ senses, concept: { stem: 'God', part_of_speech: 'Verb' } })).toHaveLength(1)
	})
})

describe('find_senses', () => {
	it('answers an unknown concept with no senses', () => {
		expect(find_senses({ senses: {}, concept: { stem: 'zzz', part_of_speech: 'Noun' } })).toEqual([])
	})
})

describe('find_sense', () => {
	const senses = group_senses_by_concept([
		sense({ stem: 'make', sense: 'A', gloss: 'to create an artifact' }),
		sense({ stem: 'make', sense: 'B', gloss: 'to make someone do something' }),
	])

	it("finds the concept's own sense among its stem's senses", () => {
		const result = find_sense({ senses, concept: { stem: 'make', sense: 'B', part_of_speech: 'Verb' } })

		expect(result.gloss).toBe('to make someone do something')
	})

	it('prefers ontology data the concept already carries', () => {
		const picked = sense({ stem: 'make', sense: 'B', gloss: 'just picked in the editor' })

		const result = find_sense({ senses, concept: { stem: 'make', sense: 'B', part_of_speech: 'Verb', ontology_data: picked } })

		expect(result.gloss).toBe('just picked in the editor')
	})

	it('falls back to empty data for a sense the ontology lacks', () => {
		const result = find_sense({ senses, concept: { stem: 'make', sense: 'Z', part_of_speech: 'Verb' } })

		expect(result).toMatchObject({ stem: 'make', sense: 'Z', gloss: '', level: '' })
	})
})

describe('get_page_concepts', () => {
	it('collects concepts and pairing concepts, skipping entities without one', () => {
		const make = { stem: 'make', sense: 'A', part_of_speech: 'Verb' } as const
		const create = { stem: 'create', sense: 'A', part_of_speech: 'Verb' } as const

		const result = get_page_concepts([entity({}), entity({ concept: make, pairing_concept: create }), entity({ concept: make })])

		expect(result).toEqual([make, create, make])
	})
})

describe('load_ontology_senses', () => {
	const ONTOLOGY = {
		make: [sense({ stem: 'make', sense: 'A' }), sense({ stem: 'make', sense: 'B' })],
		create: [sense({ stem: 'create', sense: 'A' })],
		earth: [sense({ stem: 'earth', sense: 'A', part_of_speech: 'Noun' })],
	}

	beforeEach(() => {
		vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
			const { terms } = JSON.parse(String(init.body)) as { terms: (keyof typeof ONTOLOGY)[] }
			return Response.json(Object.fromEntries(terms.map(term => [term, ONTOLOGY[term] ?? []])))
		}))
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it("loads every sense of the page's concept and pairing stems", async () => {
		const senses = await load_ontology_senses([
			entity({ concept: { stem: 'make', sense: 'A', part_of_speech: 'Verb' }, pairing_concept: { stem: 'create', sense: 'A', part_of_speech: 'Verb' } }),
		])

		expect(find_senses({ senses, concept: { stem: 'make', part_of_speech: 'Verb' } })).toHaveLength(2)
		expect(find_senses({ senses, concept: { stem: 'create', part_of_speech: 'Verb' } })).toHaveLength(1)
		expect(find_senses({ senses, concept: { stem: 'earth', part_of_speech: 'Noun' } })).toEqual([])
	})

	it('answers a page without concepts with no senses', async () => {
		expect(await load_ontology_senses([entity({})])).toEqual({})
	})

	it('degrades to no senses when ontology is unreachable', async () => {
		vi.mocked(fetch).mockRejectedValue(new Error('network down'))

		const senses = await load_ontology_senses([entity({ concept: { stem: 'make', sense: 'A', part_of_speech: 'Verb' } })])

		expect(senses).toEqual({})
	})
})
