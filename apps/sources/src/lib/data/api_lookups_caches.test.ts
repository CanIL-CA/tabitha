import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { create_fallback_ontology_data, fetch_all_concepts_for_part_of_speech, fetch_ontology_data_for_all_senses } from './api_lookups'

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

describe('fetch_ontology_data_for_all_senses', () => {
	it('keeps only in-ontology results whose stem is exactly the one asked for', async () => {
		respond_with([
			concept({ stem: 'walk' }),
			concept({ stem: 'walker' }),
			concept({ stem: 'walk', status: 'not in ontology' }),
		])

		const result = await fetch_ontology_data_for_all_senses({ stem: 'walk', sense: 'A', part_of_speech: 'Verb' })

		expect(result).toHaveLength(1)
		expect(result[0].stem).toBe('walk')
	})

	it('remembers each stem and part of speech separately', async () => {
		respond_with([concept({ stem: 'run', gloss: 'verb gloss' })])
		await fetch_ontology_data_for_all_senses({ stem: 'run', sense: 'A', part_of_speech: 'Verb' })

		respond_with([concept({ stem: 'run', gloss: 'noun gloss' })])
		const verb = await fetch_ontology_data_for_all_senses({ stem: 'run', sense: 'A', part_of_speech: 'Verb' })
		const noun = await fetch_ontology_data_for_all_senses({ stem: 'run', sense: 'A', part_of_speech: 'Noun' })

		expect(verb[0].gloss).toBe('verb gloss')
		expect(noun[0].gloss).toBe('noun gloss')
	})
})
