import { afterEach, describe, expect, it, vi } from 'vitest'
import {
	apply_pending_changes,
	approve_change,
	change_made_between_versions,
	create_change_fields,
	diff_change_fields,
	get_next_sense,
} from './changes'
import type { ConceptCreateData, ConceptUpdateData, OntologyChange } from '#lib/types.js'

const CONCEPT_KEY = { stem: 'love', sense: 'A', part_of_speech: 'Verb' } as const

const CONCEPT_DATA: ConceptUpdateData = {
	...CONCEPT_KEY,
	level: '2',
	gloss: 'to feel affection',
	brief_gloss: 'feel affection',
	categories: ['Agent-like', '', ''],
	curated_examples: '',
}

// What res.json() gives back: dates are still strings
const SERIALIZED_CHANGE = {
	id: 7,
	concept: CONCEPT_KEY,
	data: {},
	action: 'update',
	suggested_by: { id: 1, name: 'Suggester', date: '2026-01-02T03:04:05.000Z' },
	approved_by: { id: 2, name: 'Approver', date: '2026-02-03T04:05:06.000Z' },
	applied_date: '2026-03-04T05:06:07.000Z',
	version: '1.2.3',
}

function json_response({ body, status = 200 }: { body: unknown, status?: number }): Response {
	return new Response(JSON.stringify(body), { status })
}

function change_at_version(version: string | null): OntologyChange {
	return { id: 1, concept: CONCEPT_KEY, data: {}, action: 'update', suggested_by: null, approved_by: null, applied_date: null, version }
}

// The network is the boundary: a fake server that answers with the next scripted response
function fake_server(responses: Response[]) {
	const requests: { url: string, method: string | undefined }[] = []
	vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
		requests.push({ url, method: init?.method })
		const response = responses.shift()
		if (!response) throw new Error('unexpected request')
		return response
	})
	return requests
}

describe('server round trips', () => {

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	describe('approve_change', () => {
		it("posts to the approve route and revives the change's dates", async () => {
			const requests = fake_server([json_response({ body: { change: SERIALIZED_CHANGE } })])

			const change = await approve_change(7)

			expect(requests).toEqual([{ url: '/protected/changes/7/approve', method: 'POST' }])
			expect(change.suggested_by?.date).toEqual(new Date('2026-01-02T03:04:05.000Z'))
			expect(change.approved_by?.date).toEqual(new Date('2026-02-03T04:05:06.000Z'))
			expect(change.applied_date).toEqual(new Date('2026-03-04T05:06:07.000Z'))
		})

		it('keeps absent workflow info and applied date as null', async () => {
			const unreviewed = { ...SERIALIZED_CHANGE, suggested_by: null, approved_by: null, applied_date: null }
			fake_server([json_response({ body: { change: unreviewed } })])

			const change = await approve_change(7)

			expect(change.suggested_by).toBeNull()
			expect(change.approved_by).toBeNull()
			expect(change.applied_date).toBeNull()
		})

		it("throws the server's message on failure", async () => {
			fake_server([json_response({ body: { message: 'Not allowed' }, status: 403 })])

			await expect(approve_change(7)).rejects.toThrow('Not allowed')
		})

		it('throws a default message when the server gives none', async () => {
			fake_server([json_response({ body: {}, status: 500 })])

			await expect(approve_change(7)).rejects.toThrow('Failed to approve the change.')
		})
	})

	describe('apply_pending_changes', () => {
		it('posts to the apply-pending route and revives every date in the result', async () => {
			const requests = fake_server([json_response({
				body: {
					count: 1,
					failed: 0,
					version: '1.2.3',
					timestamp: '2026-04-05T06:07:08.000Z',
					changes: [SERIALIZED_CHANGE],
				},
			})])

			const result = await apply_pending_changes()

			expect(requests).toEqual([{ url: '/protected/changes/apply-pending', method: 'POST' }])
			expect(result).toMatchObject({ count: 1, failed: 0, version: '1.2.3' })
			expect(result.timestamp).toEqual(new Date('2026-04-05T06:07:08.000Z'))
			expect(result.changes[0].applied_date).toEqual(new Date('2026-03-04T05:06:07.000Z'))
			expect(result.changes[0].suggested_by?.date).toEqual(new Date('2026-01-02T03:04:05.000Z'))
		})

		it("throws the server's message on failure", async () => {
			fake_server([json_response({ body: { message: 'Nothing to apply' }, status: 409 })])

			await expect(apply_pending_changes()).rejects.toThrow('Nothing to apply')
		})

		it('throws a default message when the server gives none', async () => {
			fake_server([json_response({ body: {}, status: 500 })])

			await expect(apply_pending_changes()).rejects.toThrow('Failed to apply pending changes.')
		})
	})

	describe('get_next_sense', () => {
		it('asks the server for the next sense of a stem and part of speech', async () => {
			const requests = fake_server([json_response({ body: { next_sense: 'C' } })])

			const next_sense = await get_next_sense({ stem: 'love', part_of_speech: 'Verb' })

			expect(next_sense).toBe('C')
			expect(requests[0].url).toBe('/protected/concept/create/next-sense?stem=love&part_of_speech=Verb')
		})
	})
})

describe('diff_change_fields', () => {
	it('records nothing when no field changed', () => {
		expect(diff_change_fields({ change_data: CONCEPT_DATA, current_data: { ...CONCEPT_DATA } })).toEqual({})
	})

	it('records the old and new value of only the fields that changed', () => {
		const change_data = { ...CONCEPT_DATA, gloss: 'to care deeply', level: '3' }

		expect(diff_change_fields({ change_data, current_data: CONCEPT_DATA })).toEqual({
			level: { old: '2', value: '3' },
			gloss: { old: 'to feel affection', value: 'to care deeply' },
		})
	})

	it('compares categories by content, not identity', () => {
		const same_content = { ...CONCEPT_DATA, categories: [...CONCEPT_DATA.categories] }
		const changed = { ...CONCEPT_DATA, categories: ['Agent-like', 'Patient-like', ''] }

		expect(diff_change_fields({ change_data: same_content, current_data: CONCEPT_DATA })).toEqual({})
		expect(diff_change_fields({ change_data: changed, current_data: CONCEPT_DATA })).toEqual({
			categories: { old: CONCEPT_DATA.categories, value: changed.categories },
		})
	})

	it('ignores fields outside the diffed set', () => {
		const change_data = { ...CONCEPT_DATA, stem: 'adore' }

		expect(diff_change_fields({ change_data, current_data: CONCEPT_DATA })).toEqual({})
	})
})

describe('create_change_fields', () => {
	const create_data: ConceptCreateData = { ...CONCEPT_DATA }

	it('records every field with a value and no old value', () => {
		expect(create_change_fields(create_data)).toEqual({
			level: { value: '2' },
			gloss: { value: 'to feel affection' },
			brief_gloss: { value: 'feel affection' },
			categories: { value: ['Agent-like', '', ''] },
		})
	})

	it('leaves out a blank brief gloss', () => {
		expect(create_change_fields({ ...create_data, brief_gloss: '' })).not.toHaveProperty('brief_gloss')
	})
})

describe('change_made_between_versions', () => {
	it('accepts any change when both bounds are "all"', () => {
		const filter = change_made_between_versions({ since: 'all', before: 'all' })

		expect(filter(change_at_version(null))).toBe(true)
		expect(filter(change_at_version('Failed'))).toBe(true)
		expect(filter(change_at_version('1.0.0'))).toBe(true)
	})

	it.each([null, 'Failed'])('rejects a change whose version is %s when a bound is set', version => {
		const filter = change_made_between_versions({ since: '1.0.0', before: 'all' })

		expect(filter(change_at_version(version))).toBe(false)
	})

	it('treats "since" as exclusive and "before" as inclusive', () => {
		const filter = change_made_between_versions({ since: '1.2.3', before: '1.2.5' })

		expect(filter(change_at_version('1.2.3'))).toBe(false)
		expect(filter(change_at_version('1.2.4'))).toBe(true)
		expect(filter(change_at_version('1.2.5'))).toBe(true)
		expect(filter(change_at_version('1.2.6'))).toBe(false)
	})

	it('treats a since of "all" as no lower bound', () => {
		const filter = change_made_between_versions({ since: 'all', before: '1.0.1' })

		expect(filter(change_at_version('0.0.1'))).toBe(true)
		expect(filter(change_at_version('1.0.2'))).toBe(false)
	})

	it('treats a before of "all" as no upper bound', () => {
		const filter = change_made_between_versions({ since: '1.0.0', before: 'all' })

		expect(filter(change_at_version('99.99.9999'))).toBe(true)
	})

	it('orders by major, then minor, then patch, even with a four-digit patch', () => {
		const filter = change_made_between_versions({ since: '1.1.9494', before: '1.2.0' })

		expect(filter(change_at_version('1.1.9495'))).toBe(true)
		expect(filter(change_at_version('1.2.0'))).toBe(true)
		expect(filter(change_at_version('1.1.9494'))).toBe(false)
		expect(filter(change_at_version('2.0.0'))).toBe(false)
	})
})
