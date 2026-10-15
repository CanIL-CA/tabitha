import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { create_fallback_ontology_data, fetch_all_concepts_for_part_of_speech } from './api_lookups'

// The caches are module state with no reset, so each test uses its own key

function concept({ stem, status = 'in ontology', gloss = '' }: { stem: string, status?: string, gloss?: string }) {
	return { stem, sense: 'A', part_of_speech: 'Noun', level: '1', gloss, categorization: '', categories: [], status, how_to_hints: [] }
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
		respond_with([concept({ stem: 'kept' }), concept({ stem: 'dropped', status: 'not in ontology' })])

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
