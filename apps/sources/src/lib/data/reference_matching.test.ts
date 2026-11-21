import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { D1DatabaseSession } from '@cloudflare/workers-types'
import { get_secondary_ids, get_source_data } from './read'
import { get_verse_encoding_availability } from './encoded'
import { get_book_status } from './status'

// References come straight from URLs (`/bible/psalms/23/1`), so lookups ignore case. They match
// exactly otherwise: `%` and `_` are ordinary characters, not wildcards, which also keeps the
// lookups on the NOCASE reference index instead of scanning a whole type.

// The columns these lookups read, as tools/databases/migrations/sources creates them
const SCHEMA = `
	CREATE TABLE Sources (type, id_primary, id_secondary, id_tertiary, phase_1_encoding, semantic_encoding, status, notes);
	CREATE INDEX idx_sources_reference ON Sources (type COLLATE NOCASE, id_primary COLLATE NOCASE, id_secondary, id_tertiary);
	CREATE TABLE ChapterStatus (type, id_primary, id_secondary, status);
	INSERT INTO Sources VALUES ('Bible', 'Genesis', '1', '1', 'In the beginning', '~encoded~', 'Ready to Translate', '');
	INSERT INTO Sources VALUES ('Bible', 'Genesis', '1', '2', 'The earth was formless', '', 'Not Started', '');
	INSERT INTO Sources VALUES ('Bible', '1 Kings', '12', '6', 'Rehoboam asked', '', 'Not Started', '');
	INSERT INTO Sources VALUES ('Bible', '2 Kings', '7', '2', 'The officer answered', '', 'Not Started', '');
	INSERT INTO ChapterStatus VALUES ('Bible', 'Genesis', '1', 'Ready to Translate');
`

// Wraps an in-memory SQLite database in the slice of D1's session API these lookups use
function create_test_db(): D1DatabaseSession {
	const sqlite = new DatabaseSync(':memory:')
	sqlite.exec(SCHEMA)

	const bind = (sql: string) => (...params: SQLInputValue[]) => ({
		all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
		first: async () => sqlite.prepare(sql).get(...params) ?? null,
	})

	return {
		prepare: (sql: string) => ({ bind: bind(sql) }),
		batch: async (statements: { all: () => Promise<unknown> }[]) => Promise.all(statements.map(statement => statement.all())),
	} as unknown as D1DatabaseSession
}

describe('reference lookups ignore case', () => {
	it.each([
		['Bible', 'Genesis'],
		['bible', 'genesis'],
		['BIBLE', 'GENESIS'],
	])('finds Genesis 1:1 as %s/%s', async (type, id_primary) => {
		const source = await get_source_data({ db: create_test_db(), type, id_primary, id_secondary: '1', id_tertiary: '1' })

		expect(source?.phase_1_encoding).toBe('In the beginning')
	})

	it('lists the chapters of a lowercase book', async () => {
		const chapters = await get_secondary_ids({ db: create_test_db(), type: 'bible', id_primary: '1 kings' })

		expect(chapters).toEqual([{ id_secondary: '12' }])
	})

	it('reports the encoding of a lowercase reference', async () => {
		const [result] = await get_verse_encoding_availability({ db: create_test_db(), references: [{ type: 'bible', id_primary: 'genesis', id_secondary: '1', id_tertiary: '1' }] })

		expect(result?.has_encoding).toBe(true)
	})

	it('reports the status of a lowercase book', async () => {
		const { status } = await get_book_status({ db: create_test_db(), reference: { type: 'bible', id_primary: 'genesis' } })

		expect(status).toBe('Ready to Translate')
	})
})

describe('reference lookups treat % and _ as ordinary characters, not wildcards', () => {
	it.each([
		['%', 'any book'],
		['_ Kings', '1 Kings or 2 Kings'],
		['Gen%', 'a book starting with Gen'],
	])('lists no chapters for the book "%s", rather than %s', async id_primary => {
		expect(await get_secondary_ids({ db: create_test_db(), type: 'Bible', id_primary })).toEqual([])
	})

	it('finds no verse in a type of "%"', async () => {
		expect(await get_source_data({ db: create_test_db(), type: '%', id_primary: 'Genesis', id_secondary: '1', id_tertiary: '1' })).toBeNull()
	})

	it('reports no encoding for a book of "%"', async () => {
		const [result] = await get_verse_encoding_availability({ db: create_test_db(), references: [{ type: 'Bible', id_primary: '%', id_secondary: '1', id_tertiary: '1' }] })

		expect(result?.has_encoding).toBe(false)
	})

	it('reports a book of "%" as Not Started rather than combining every book', async () => {
		const { status } = await get_book_status({ db: create_test_db(), reference: { type: 'Bible', id_primary: '%' } })

		expect(status).toBe('Not Started')
	})
})
