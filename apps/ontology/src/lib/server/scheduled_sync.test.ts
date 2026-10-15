import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMBEDDING_DIMENSIONS } from '@tabitha/ai'
import { is_scheduler_authorized, run_scheduled_sync } from './scheduled_sync'
import type { ConceptIndex } from './concept_embeddings'
import type { D1Database, VectorizeVector } from '@cloudflare/workers-types'

const GATEWAY_ENV = { CLOUDFLARE_ACCOUNT_ID: 'account', AI_GATEWAY_TOKEN: 'token', GEMINI_PROJECT_ID: 'project', GEMINI_LOCATION: 'global' }

type ConceptRow = { id: string, stem: string, sense: string, part_of_speech: string, level: number, categorization: string, examples: string, curated_examples: string, gloss: string, brief_gloss: string, occurrences: number }
type ComplexTermRow = { stem: string, sense: string, part_of_speech: string, structure: string, pairing: string, explication: string, ontology_status: string, level: number, notes: string }
type FakeStatement = { sql: string, params: unknown[] }

const REJOICE_ROW: ConceptRow = {
	id: '1', stem: 'rejoice', sense: 'A', part_of_speech: 'Verb', level: 1, categorization: '', examples: '',
	curated_examples: '', gloss: 'to feel great happiness', brief_gloss: '', occurrences: 0,
}

// Three header rows, then a how-to term the ontology doesn't have yet
const SHEET_TSV = ['', '', '', 'fellowship\tnoun\tX has fellowship with Y\tfriendship\tX and Y spend time together\tsuggested\tlevel 1\t'].join('\n')
const SHEET_URL_PART = 'docs.google.com/spreadsheets'

/**
 * The database as the sync sees it: the Concepts table plus a Complex_Terms table the sync itself
 * rewrites. It stands in for D1, so statements are told apart by their SQL.
 */
function create_fake_db({ concepts }: { concepts: ConceptRow[] }) {
	let complex_terms: ComplexTermRow[] = []

	function statement({ sql, params }: FakeStatement) {
		return {
			sql,
			params,
			bind: (...bound: unknown[]) => statement({ sql, params: bound }),
			run: async () => ({}),
			all: async () => ({ results: sql.includes('FROM Concepts') ? concepts : complex_terms }),
			first: async () => complex_terms.length,
		}
	}

	return {
		complex_terms: () => complex_terms,
		prepare: (sql: string) => statement({ sql, params: [] }),
		withSession() {
			return this
		},
		batch: async (statements: FakeStatement[]) => {
			for (const { sql, params } of statements) {
				if (sql.includes('DELETE FROM Complex_Terms')) complex_terms = []
				if (sql.includes('INSERT INTO Complex_Terms')) {
					const [stem, sense, part_of_speech, structure, pairing, explication, ontology_status, level, notes] = params as [string, string, string, string, string, string, string, number, string]
					complex_terms.push({ stem, sense, part_of_speech, structure, pairing, explication, ontology_status, level, notes })
				}
			}
			return []
		},
	}
}

function create_fake_index(): ConceptIndex & { vectors: Map<string, VectorizeVector> } {
	const vectors = new Map<string, VectorizeVector>()
	return {
		vectors,
		query: async () => ({ count: 0, matches: [] }),
		upsert: async (new_vectors: VectorizeVector[]) => {
			for (const vector of new_vectors) vectors.set(vector.id, vector)
		},
		getByIds: async (ids: string[]) => ids.flatMap(id => vectors.get(id) ?? []),
		deleteByIds: async (ids: string[]) => {
			for (const id of ids) vectors.delete(id)
		},
	}
}

// The two network boundaries: the how-to spreadsheet and the AI Gateway's embedding endpoint
function stub_network({ sheet_status = 200 }: { sheet_status?: number } = {}): void {
	vi.stubGlobal('fetch', async (input: string | URL | Request) => {
		const url = String(input instanceof Request ? input.url : input)
		if (url.includes(SHEET_URL_PART)) return new Response(sheet_status === 200 ? SHEET_TSV : 'unavailable', { status: sheet_status })
		return Response.json({ embedding: { values: Array(EMBEDDING_DIMENSIONS).fill(0.1) } })
	})
}

describe('is_scheduler_authorized', () => {
	it('accepts the expected bearer token', () => {
		expect(is_scheduler_authorized({ authorization_header: 'Bearer s3cret', expected_token: 's3cret' })).toBe(true)
	})

	it.each([
		['a wrong token', 'Bearer wrong!'],
		['a token of a different length', 'Bearer s3cret-and-more'],
		['a missing header', null],
		['the token without the Bearer scheme', 's3cret'],
	])('rejects %s', (_, authorization_header) => {
		expect(is_scheduler_authorized({ authorization_header, expected_token: 's3cret' })).toBe(false)
	})

	it.each([
		['unset', undefined],
		['empty', ''],
	])('rejects every request while the expected token is %s', (_, expected_token) => {
		expect(is_scheduler_authorized({ authorization_header: 'Bearer ', expected_token })).toBe(false)
		expect(is_scheduler_authorized({ authorization_header: null, expected_token })).toBe(false)
	})
})

describe('run_scheduled_sync', () => {
	beforeEach(() => {
		vi.spyOn(console, 'info').mockImplementation(() => {})
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	function make_env({ db, index }: { db: ReturnType<typeof create_fake_db>, index: ConceptIndex }) {
		return { ...GATEWAY_ENV, DB_Ontology: db as unknown as D1Database, VECTORIZE_Concepts: index }
	}

	it("loads the sheet's terms, then embeds the concepts, including a term only the sheet knows", async () => {
		stub_network()
		const db = create_fake_db({ concepts: [REJOICE_ROW] })
		const index = create_fake_index()

		const summary = await run_scheduled_sync(make_env({ db, index }))

		expect(summary).toEqual({ complex_terms: 1, embedded: 2, unchanged: 0, failed: 0 })
		expect(db.complex_terms().map(({ stem, part_of_speech }) => ({ stem, part_of_speech }))).toEqual([{ stem: 'fellowship', part_of_speech: 'Noun' }])
		expect([...index.vectors.keys()].toSorted()).toEqual(['fellowship--Noun', 'rejoice-A-Verb'])
	})

	it('embeds nothing the second time when no concept text has changed', async () => {
		stub_network()
		const db = create_fake_db({ concepts: [REJOICE_ROW] })
		const index = create_fake_index()
		await run_scheduled_sync(make_env({ db, index }))

		const summary = await run_scheduled_sync(make_env({ db, index }))

		expect(summary).toEqual({ complex_terms: 1, embedded: 0, unchanged: 2, failed: 0 })
	})

	it("still embeds the ontology's concepts when the sheet can't be fetched, then surfaces that failure", async () => {
		stub_network({ sheet_status: 503 })
		const db = create_fake_db({ concepts: [REJOICE_ROW] })
		const index = create_fake_index()

		await expect(run_scheduled_sync(make_env({ db, index }))).rejects.toThrow('Failed to fetch complex terms sheet')
		expect([...index.vectors.keys()]).toEqual(['rejoice-A-Verb'])
	})
})
