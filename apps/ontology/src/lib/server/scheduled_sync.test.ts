import { beforeEach, describe, expect, it, vi } from 'vitest'
import { is_scheduler_authorized, run_scheduled_sync } from './scheduled_sync'
import { sync_complex_terms } from './complex_terms'
import { sync_concept_embeddings, type ConceptIndex } from './concept_embeddings'
import { get_all_concepts } from './ontology'
import type { D1Database } from '@cloudflare/workers-types'

vi.mock('./complex_terms', () => ({ sync_complex_terms: vi.fn() }))
vi.mock('./ontology', () => ({ get_all_concepts: vi.fn() }))
vi.mock('./concept_embeddings', () => ({
	create_concept_embedder: vi.fn(() => ({ embed_text: vi.fn() })),
	sync_concept_embeddings: vi.fn(),
}))

const env = {
	DB_Ontology: { withSession: () => ({}) } as unknown as D1Database,
	VECTORIZE_Concepts: {} as ConceptIndex,
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
		vi.mocked(sync_complex_terms).mockReset()
		vi.mocked(get_all_concepts).mockResolvedValue([])
		vi.mocked(sync_concept_embeddings).mockResolvedValue({ embedded: 3, unchanged: 5, failed: 0 })
		vi.spyOn(console, 'info').mockImplementation(() => {})
	})

	it('syncs complex terms, then embeddings, and summarizes both', async () => {
		vi.mocked(sync_complex_terms).mockResolvedValue(42)

		expect(await run_scheduled_sync(env)).toEqual({ complex_terms: 42, embedded: 3, unchanged: 5, failed: 0 })
		expect(vi.mocked(sync_complex_terms).mock.invocationCallOrder[0])
			.toBeLessThan(vi.mocked(sync_concept_embeddings).mock.invocationCallOrder[0])
	})

	it('still syncs embeddings when the complex-terms sync fails, then surfaces that failure', async () => {
		vi.mocked(sync_complex_terms).mockRejectedValue(new Error('spreadsheet unreachable'))

		await expect(run_scheduled_sync(env)).rejects.toThrow('spreadsheet unreachable')
		expect(sync_concept_embeddings).toHaveBeenCalled()
	})
})
