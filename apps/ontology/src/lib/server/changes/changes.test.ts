import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { D1DatabaseSession } from '@cloudflare/workers-types'
import type { OntologyChange, ConceptCreateData, OntologyUser } from '#lib/types.js'
import { apply_change_directly, approve_change, can_approve_change, suggest_change } from './changes'

// The tables changes.ts and the modules it calls read and write, as they're defined in the Ontology
// snapshots (tools/databases/snapshots), with the Version row set to what that snapshot had.
const SCHEMA = `
	CREATE TABLE Concepts (id INTEGER, stem TEXT, sense TEXT, part_of_speech TEXT, occurrences INTEGER, gloss TEXT, brief_gloss TEXT, note TEXT, categorization TEXT, curated_examples TEXT, level INTEGER);
	CREATE TABLE Changes (id INTEGER PRIMARY KEY, concept_stem TEXT, concept_sense TEXT, concept_part_of_speech TEXT, action TEXT, data TEXT, suggested_by_id INTEGER, suggested_date TEXT, approved_by_id INTEGER, approved_date TEXT, applied_date TEXT, version TEXT);
	CREATE TABLE Complex_Terms (stem TEXT, sense TEXT, part_of_speech TEXT, structure TEXT, pairing TEXT, explication TEXT, ontology_status TEXT, level INTEGER, notes TEXT);
	CREATE TABLE Version (version TEXT);
	INSERT INTO Version VALUES ('3.0.9500');
	INSERT INTO Concepts VALUES (1, 'faith', 'A', 'Noun', 0, 'trust in God', '', NULL, 'o', '', 1);
	INSERT INTO Concepts VALUES (2, 'trust', 'A', 'Noun', 0, 'rely on', '', NULL, 'o', '', 1);
`

// Wraps an in-memory SQLite database in the slice of D1's session API that the Ontology code uses
function create_test_db(): { db: D1DatabaseSession, query: <T>(sql: string) => T[] } {
	const sqlite = new DatabaseSync(':memory:', { enableDoubleQuotedStringLiterals: true })
	sqlite.exec(SCHEMA)

	function statement({ sql, params = [] }: { sql: string, params?: SQLInputValue[] }) {
		return {
			bind: (...bound: SQLInputValue[]) => statement({ sql, params: bound }),
			first: async (column?: string) => {
				const row = sqlite.prepare(sql).get(...params) as Record<string, unknown> | undefined
				return (column && row ? row[column] : row) ?? null
			},
			all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
			run: async () => ({ meta: { last_row_id: Number(sqlite.prepare(sql).run(...params).lastInsertRowid) } }),
		}
	}

	return {
		db: { prepare: (sql: string) => statement({ sql }) } as unknown as D1DatabaseSession,
		query: <T>(sql: string) => sqlite.prepare(sql).all() as T[],
	}
}

type ChangeRow = {
	action: string
	suggested_by_id: number | null
	approved_by_id: number | null
	applied_date: string | null
	version: string | null
}

const CHANGES_SQL = 'SELECT action, suggested_by_id, approved_by_id, applied_date, version FROM Changes'
const CONCEPT_STEMS_SQL = 'SELECT stem FROM Concepts WHERE part_of_speech = \'Noun\' ORDER BY id'

function make_change(overrides: Partial<OntologyChange> = {}): OntologyChange {
	return {
		id: 1,
		concept: { stem: 'love', sense: 'A', part_of_speech: 'Verb' },
		data: {},
		action: 'create',
		suggested_by: null,
		approved_by: null,
		applied_date: null,
		version: null,
		...overrides,
	}
}

const user: OntologyUser = {
	id: 1,
	email: 'user@example.com',
	name: 'user',
	permissions: {
		has_protected_access: true,
		can_add: false,
		can_update: false,
	},
}

describe('can_approve_change', () => {
	it('returns false for a change that was never suggested (applied directly by an authorized user)', () => {
		const change = make_change({ suggested_by: null, approved_by: { name: 'x', date: new Date() } })
		expect(can_approve_change({ change, permissions: { can_add: true, can_update: true } })).toBe(false)
	})

	it('returns false once a suggestion is already approved', () => {
		const change = make_change({
			suggested_by: { name: 'suggester', date: new Date() },
			approved_by: { name: 'approver', date: new Date() },
		})
		expect(can_approve_change({ change, permissions: { can_add: true, can_update: true } })).toBe(false)
	})

	it("requires can_add for a 'create' suggestion", () => {
		const change = make_change({ action: 'create', suggested_by: { name: 'a', date: new Date() } })
		expect(can_approve_change({ change, permissions: { can_add: true, can_update: false } })).toBe(true)
		expect(can_approve_change({ change, permissions: { can_add: false, can_update: true } })).toBe(false)
	})

	it("requires can_update for an 'update' suggestion", () => {
		const change = make_change({ action: 'update', suggested_by: { name: 'a', date: new Date() } })
		expect(can_approve_change({ change, permissions: { can_add: false, can_update: true } })).toBe(true)
		expect(can_approve_change({ change, permissions: { can_add: true, can_update: false } })).toBe(false)
	})
})

const create_data: ConceptCreateData = {
	stem: 'peace',
	sense: 'A',
	part_of_speech: 'Noun',
	level: '1',
	gloss: 'a state of calm',
	brief_gloss: '',
	categories: [],
	curated_examples: '',
}

describe('suggest_change', () => {
	it('records a suggestion, and does not apply it, when the user lacks permission', async () => {
		const { db, query } = create_test_db()

		const applied = await suggest_change({ db, action: 'create', data: create_data, user })

		expect(applied).toBe(false)
		expect(query<ChangeRow>(CHANGES_SQL)).toEqual([
			{ action: 'create', suggested_by_id: user.id, approved_by_id: null, applied_date: null, version: null },
		])
		expect(query<{ stem: string }>(CONCEPT_STEMS_SQL).map(({ stem }) => stem)).toEqual(['faith', 'trust'])
	})
})

describe('apply_change_directly', () => {
	it('applies a new concept immediately, in its sorted place, when the user is authorized', async () => {
		const { db, query } = create_test_db()

		const applied = await apply_change_directly({ db, action: 'create', data: create_data, user })

		expect(applied).toBe(true)
		expect(query<{ stem: string }>(CONCEPT_STEMS_SQL).map(({ stem }) => stem)).toEqual(['faith', 'peace', 'trust'])
		expect(query<{ gloss: string }>('SELECT gloss FROM Concepts WHERE stem = \'peace\'')).toEqual([{ gloss: 'a state of calm' }])
	})

	it('records who approved the change, when it was applied, and the new version', async () => {
		const { db, query } = create_test_db()

		await apply_change_directly({ db, action: 'create', data: create_data, user })

		const [change] = query<ChangeRow>(CHANGES_SQL)
		expect(change).toMatchObject({ action: 'create', suggested_by_id: null, approved_by_id: user.id, version: '3.0.9501' })
		expect(change.applied_date).not.toBeNull()
		expect(query<{ version: string }>('SELECT version FROM Version')).toEqual([{ version: '3.0.9501' }])
	})
})

describe('approve_change', () => {
	const suggestion = `INSERT INTO Changes (id, concept_stem, concept_sense, concept_part_of_speech, action, data, suggested_by_id, suggested_date)
		VALUES (1, 'peace', 'A', 'Noun', 'create', '{}', 2, '2026-10-01T00:00:00.000Z')`

	it('records the approving user on the change, leaving it unapplied', async () => {
		const { db, query } = create_test_db()
		query(suggestion)

		const updated = await approve_change({ db, id: 1, user })

		expect(updated.approved_by?.id).toBe(user.id)
		expect(updated.applied_date).toBeNull()
		expect(query<ChangeRow>(CHANGES_SQL)[0]).toMatchObject({ suggested_by_id: 2, approved_by_id: user.id })
	})

	it('keeps the first approver when a change is approved again', async () => {
		const { db, query } = create_test_db()
		query(suggestion)
		await approve_change({ db, id: 1, user })

		const updated = await approve_change({ db, id: 1, user: { ...user, id: 7 } })

		expect(updated.approved_by?.id).toBe(user.id)
	})
})
