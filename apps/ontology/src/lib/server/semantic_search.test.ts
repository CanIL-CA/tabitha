import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMBEDDING_DIMENSIONS } from '@tabitha/ai'
import { find_related_concepts } from './semantic_search'
import { get_concepts_by_keys } from './ontology'
import type { ConceptIndex } from './concept_embeddings'
import type { D1Database } from '@cloudflare/workers-types'
import type { Concept } from '#lib/types.js'

vi.mock('./ontology', () => ({ get_concepts_by_keys: vi.fn() }))

const fetch_mock = vi.fn()
vi.stubGlobal('fetch', fetch_mock)

const db = {} as D1Database

function make_concept(stem: string): Concept {
	return {
		id: stem,
		stem,
		sense: 'A',
		part_of_speech: 'Verb',
		level: '1',
		categorization: '',
		examples: '',
		gloss: '',
		brief_gloss: '',
		occurrences: 0,
		categories: [],
		curated_examples: [],
		curated_examples_raw: '',
		status: 'in ontology',
		how_to_hints: [],
		pending_changes: [],
	}
}

function create_index(stems: string[]): ConceptIndex {
	return {
		query: vi.fn(async () => ({
			count: stems.length,
			matches: stems.map((stem, i) => ({ id: `${stem}-A-Verb`, score: 1 - i / 10, metadata: { stem, sense: 'A', part_of_speech: 'Verb' } })),
		})),
		upsert: vi.fn(),
		getByIds: vi.fn(),
		deleteByIds: vi.fn(),
	}
}

describe('find_related_concepts', () => {
	beforeEach(() => {
		fetch_mock.mockReset()
		fetch_mock.mockResolvedValue({ ok: true, json: async () => ({ embedding: { values: Array(EMBEDDING_DIMENSIONS).fill(0.1) } }) })
		vi.mocked(get_concepts_by_keys).mockReset()
		vi.spyOn(console, 'error').mockImplementation(() => {})
		vi.spyOn(console, 'warn').mockImplementation(() => {})
	})

	it('returns the nearest concepts in similarity order, without the concept that is the search term itself', async () => {
		vi.mocked(get_concepts_by_keys).mockResolvedValue([make_concept('delight'), make_concept('rejoice')])

		const related = await find_related_concepts({ db, index: create_index(['joy', 'rejoice', 'delight']), search_term: 'joy' })

		expect(get_concepts_by_keys).toHaveBeenCalledWith({
			db,
			keys: [{ stem: 'rejoice', sense: 'A', part_of_speech: 'Verb' }, { stem: 'delight', sense: 'A', part_of_speech: 'Verb' }],
		})
		expect(related.map(concept => concept.stem)).toEqual(['rejoice', 'delight'])
	})

	it('embeds the search term as a query and asks the gateway to cache it', async () => {
		vi.mocked(get_concepts_by_keys).mockResolvedValue([])

		await find_related_concepts({ db, index: create_index([]), search_term: 'joy' })

		const [url, init] = fetch_mock.mock.calls[0]
		expect(url).toContain('gemini-embedding-2:embedContent')
		expect(JSON.parse(init.body).content.parts[0].text).toBe('task: search result | query: joy')
		expect(init.headers).toEqual(expect.objectContaining({ 'cf-aig-cache-ttl': String(7 * 24 * 60 * 60) }))
	})

	it('returns nothing without an index binding, as in local dev', async () => {
		expect(await find_related_concepts({ db, index: undefined, search_term: 'joy' })).toEqual([])
		expect(fetch_mock).not.toHaveBeenCalled()
	})

	it('returns nothing, and logs, when the index query fails', async () => {
		const index = create_index([])
		vi.mocked(index.query).mockRejectedValue(new Error('index unavailable'))
		vi.mocked(get_concepts_by_keys).mockResolvedValue([])

		expect(await find_related_concepts({ db, index, search_term: 'joy' })).toEqual([])
		expect(console.error).toHaveBeenCalled()
	})

	it('returns nothing when embedding the search term fails', async () => {
		fetch_mock.mockResolvedValue({ ok: false, status: 503, statusText: 'Unavailable', text: async () => '' })
		vi.mocked(get_concepts_by_keys).mockResolvedValue([])
		const index = create_index(['rejoice'])

		expect(await find_related_concepts({ db, index, search_term: 'joy' })).toEqual([])
		expect(index.query).not.toHaveBeenCalled()
	})

	it('rejects a search term that is too long without embedding it', async () => {
		expect(await find_related_concepts({ db, index: create_index([]), search_term: 'x'.repeat(201) })).toEqual([])
		expect(fetch_mock).not.toHaveBeenCalled()
	})
})
