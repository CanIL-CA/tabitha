import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { create_fallback_ontology_data, fetch_all_concepts_for_part_of_speech, fetch_ontology_data_for_all, get_page_concepts } from './api_lookups'
import type { ConceptKey, SourceEntity, OntologyResult } from '@tabitha/types'

// The caches are module state with no reset, so each test uses its own key

// Only the concept fields matter here; the rest of an entity is parsing detail these functions never read
function entity({ concept = null, pairing_concept = null }: { concept?: ConceptKey | null, pairing_concept?: ConceptKey | null }): SourceEntity {
	return { concept, pairing_concept } as SourceEntity
}

function concept({ stem, sense = 'A', part_of_speech = 'Noun', status = 'in ontology', gloss = '' }: Partial<OntologyResult> & { stem: string }) {
	return { stem, sense, part_of_speech, level: '1', gloss, categorization: '', categories: [], status, how_to_hints: [] }
}

function respond_with(results: object[]) {
	vi.mocked(fetch).mockImplementation(async () => Response.json(results))
}

beforeEach(() => {
	vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('create_fallback_ontology_data', () => {
	it('keeps the concept key and fills the rest with empty values', () => {
		expect(create_fallback_ontology_data({ stem: 'love', sense: 'B', part_of_speech: 'Verb' })).toEqual({
			stem: 'love',
			sense: 'B',
			part_of_speech: 'Verb',
			level: '',
			gloss: '',
			categorization: '',
			categories: [],
			status: 'in ontology',
			how_to_hints: [],
		})
	})
})

describe('fetch_all_concepts_for_part_of_speech', () => {
	it('keeps only concepts that are in the ontology', async () => {
		respond_with([concept({ stem: 'kept' }), concept({ stem: 'dropped', status: 'unknown' })])

		const result = await fetch_all_concepts_for_part_of_speech('Particle')

		expect(result.map(({ stem }) => stem)).toEqual(['kept'])
	})

	it('keeps answering a part of speech with what it first learned', async () => {
		respond_with([concept({ stem: 'first' })])
		await fetch_all_concepts_for_part_of_speech('Adverb')

		respond_with([concept({ stem: 'changed' })])
		const second = await fetch_all_concepts_for_part_of_speech('Adverb')

		expect(second.map(({ stem }) => stem)).toEqual(['first'])
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

describe('fetch_ontology_data_for_all', () => {
	const ONTOLOGY = {
		make: [concept({ stem: 'make', sense: 'A' }), concept({ stem: 'make', sense: 'B' })],
		create: [concept({ stem: 'create', sense: 'A' })],
		earth: [concept({ stem: 'earth', sense: 'A', part_of_speech: 'Noun' })],
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

	it("fetches results for all of the page's concept and pairing stems", async () => {
		const results_by_stem = await fetch_ontology_data_for_all([
			entity({ concept: { stem: 'make', sense: 'A', part_of_speech: 'Verb' }, pairing_concept: { stem: 'create', sense: 'A', part_of_speech: 'Verb' } }),
		])

		expect(results_by_stem['make']).toHaveLength(2)
		expect(results_by_stem['create']).toHaveLength(1)
		expect(results_by_stem['earth']).toBeUndefined()
	})

	it('answers a page without concepts with no senses', async () => {
		expect(await fetch_ontology_data_for_all([entity({})])).toEqual({})
	})

	it('degrades to no senses when ontology is unreachable', async () => {
		vi.mocked(fetch).mockRejectedValue(new Error('network down'))

		const senses = await fetch_ontology_data_for_all([entity({ concept: { stem: 'make', sense: 'A', part_of_speech: 'Verb' } })])

		expect(senses).toEqual({})
	})
})
