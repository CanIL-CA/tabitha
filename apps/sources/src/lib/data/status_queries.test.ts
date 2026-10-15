import { describe, expect, it } from 'vitest'
import type { D1DatabaseSession } from '@cloudflare/workers-types'
import type { SourceStatus } from '@tabitha/types'
import {
	get_all_book_statuses,
	get_book_status,
	get_chapter_status,
	get_chapter_statuses_for_book,
	get_verse_statuses,
} from './status'

function fake_db({ rows = [], first_row = null, batch_rows = [] }: {
	readonly rows?: readonly object[]
	readonly first_row?: object | null
	readonly batch_rows?: readonly (readonly object[])[]
}) {
	const db = {
		prepare: () => ({
			bind: () => ({
				all: async () => ({ results: rows }),
				first: async () => first_row,
			}),
		}),
		batch: async () => batch_rows.map(results => ({ results })),
	} as unknown as D1DatabaseSession
	return db
}

function status_row({ id_primary, status }: { id_primary: string, status: SourceStatus }) {
	return { id_primary, status }
}

describe('get_all_book_statuses', () => {
	it('combines the chapter statuses of each book separately', async () => {
		const db = fake_db({
			rows: [
				status_row({ id_primary: 'Luke', status: 'Ready to Translate' }),
				status_row({ id_primary: 'Luke', status: 'Ready to Translate' }),
				status_row({ id_primary: 'Acts', status: 'Not Started' }),
				status_row({ id_primary: 'Acts', status: 'Ready to Translate' }),
			],
		})

		const result = await get_all_book_statuses({ db, type: 'Bible' })

		expect(result).toHaveLength(2)
		expect(result).toContainEqual({ reference: { type: 'Bible', id_primary: 'Luke' }, status: 'Ready to Translate' })
		expect(result).toContainEqual({ reference: { type: 'Bible', id_primary: 'Acts' }, status: 'Initial Analysis in Progress' })
	})

	it('returns nothing when the type has no chapters', async () => {
		const db = fake_db({})

		expect(await get_all_book_statuses({ db, type: 'Bible' })).toEqual([])
	})
})

describe('get_book_status', () => {
	it("combines the statuses of the book's chapters", async () => {
		const reference = { type: 'Bible', id_primary: 'Luke' }
		const db = fake_db({ rows: [{ status: 'Not Started' }, { status: 'Not Started' }] })

		const result = await get_book_status({ db, reference })

		expect(result).toEqual({ reference, status: 'Not Started' })
	})

	it('is Not Started for a book with no chapters', async () => {
		const reference = { type: 'Bible', id_primary: 'Luke' }
		const db = fake_db({})

		expect((await get_book_status({ db, reference })).status).toBe('Not Started')
	})
})

describe('get_chapter_statuses_for_book', () => {
	it('returns one secondary-level result per chapter, with the chapter added to the reference', async () => {
		const reference = { type: 'Bible', id_primary: 'Luke' }
		const db = fake_db({
			rows: [
				{ id_secondary: '1', status: 'Ready to Translate' },
				{ id_secondary: '2', status: 'Not Started' },
			],
		})

		const result = await get_chapter_statuses_for_book({ db, reference })

		expect(result).toEqual([
			{ level: 'secondary', reference: { ...reference, id_secondary: '1' }, status: 'Ready to Translate' },
			{ level: 'secondary', reference: { ...reference, id_secondary: '2' }, status: 'Not Started' },
		])
	})
})

describe('get_chapter_status', () => {
	const reference = { type: 'Bible', id_primary: 'Luke', id_secondary: '3' }

	it('returns the stored status', async () => {
		const db = fake_db({ first_row: { status: 'Final Review in Progress' } })

		const result = await get_chapter_status({ db, reference })

		expect(result).toEqual({ reference, status: 'Final Review in Progress' })
	})

	it('is Not Started when the chapter has no row', async () => {
		const db = fake_db({ first_row: null })

		expect((await get_chapter_status({ db, reference })).status).toBe('Not Started')
	})
})

describe('get_verse_statuses', () => {
	const references = [
		{ type: 'Bible', id_primary: 'Luke', id_secondary: '1', id_tertiary: '1' },
		{ type: 'Bible', id_primary: 'Luke', id_secondary: '1', id_tertiary: '2' },
	]

	it('pairs each reference with its own status', async () => {
		const db = fake_db({ batch_rows: [[{ status: 'Ready to Translate' }], [{ status: 'Final Review in Progress' }]] })

		const result = await get_verse_statuses({ db, references })

		expect(result).toEqual([
			{ reference: references[0], status: 'Ready to Translate' },
			{ reference: references[1], status: 'Final Review in Progress' },
		])
	})

	it('is Not Started for a verse the query found no row for', async () => {
		const db = fake_db({ batch_rows: [[], [{ status: 'Ready to Translate' }]] })

		const result = await get_verse_statuses({ db, references })

		expect(result.map(({ status }) => status)).toEqual(['Not Started', 'Ready to Translate'])
	})
})
