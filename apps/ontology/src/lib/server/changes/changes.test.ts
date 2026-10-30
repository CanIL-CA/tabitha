import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { D1DatabaseSession } from '@cloudflare/workers-types'
import { get_concept_for_update } from './concepts'
import type { OntologyChange, ConceptCreateData, OntologyUser } from '#lib/types.js'
import {
	apply_change_directly,
	approve_change,
	can_approve_change,
	can_edit_change,
	edit_suggested_change,
	get_and_validate_change,
	get_change,
	get_change_from_url,
	get_pending_changes_for_concept,
	suggest_change,
} from './changes'

// The tables changes.ts and the modules it calls read and write, as they're defined in the Ontology
// snapshots (tools/databases/snapshots), with the Version row set to what that snapshot had.
const SCHEMA = `
	CREATE TABLE Concepts (id INTEGER, stem TEXT, sense TEXT, part_of_speech TEXT, occurrences INTEGER, gloss TEXT, brief_gloss TEXT, note TEXT, categorization TEXT, curated_examples TEXT, level INTEGER);
	CREATE TABLE Changes (id INTEGER PRIMARY KEY, concept_stem TEXT, concept_sense TEXT, concept_part_of_speech TEXT, action TEXT, data TEXT, suggested_by_id INTEGER, suggested_date TEXT, approved_by_id INTEGER, approved_date TEXT, applied_date TEXT, version TEXT);
	CREATE TABLE Complex_Terms (stem TEXT, sense TEXT, part_of_speech TEXT, structure TEXT, pairing TEXT, explication TEXT, ontology_status TEXT, level INTEGER, notes TEXT);
	CREATE TABLE Version (version TEXT);
	INSERT INTO Version VALUES ('3.0.9500');
	CREATE TABLE OntologyVersion (Version TEXT);
	INSERT INTO OntologyVersion VALUES ('3.0.9500');
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
const CONCEPT_STEMS_SQL = "SELECT stem FROM Concepts WHERE part_of_speech = 'Noun' ORDER BY id"

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

// The slice of App.Locals the change-editing functions read
function create_locals(db: D1DatabaseSession): App.Locals {
	return { db_ontology: db, user } as App.Locals
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
		expect(query<{ gloss: string }>("SELECT gloss FROM Concepts WHERE stem = 'peace'")).toEqual([{ gloss: 'a state of calm' }])
	})

	it('records who approved the change, when it was applied, and the new version', async () => {
		const { db, query } = create_test_db()

		await apply_change_directly({ db, action: 'create', data: create_data, user })

		const [change] = query<ChangeRow>(CHANGES_SQL)
		expect(change).toMatchObject({ action: 'create', suggested_by_id: null, approved_by_id: user.id, version: '3.0.9501' })
		expect(change.applied_date).not.toBeNull()
		expect(query<{ version: string }>('SELECT version FROM Version')).toEqual([{ version: '3.0.9501' }])
		expect(query<{ Version: string }>('SELECT Version FROM OntologyVersion')).toEqual([{ Version: '3.0.9501' }])
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

describe('get_pending_changes_for_concept', () => {
	const changes = `INSERT INTO Changes (id, concept_stem, concept_sense, concept_part_of_speech, action, data, suggested_by_id, suggested_date, approved_by_id, approved_date, applied_date) VALUES
		(1, 'faith', 'A', 'Noun', 'update', '{"gloss":{"old":"trust in God","value":"belief"}}', 2, '2026-10-01T00:00:00.000Z', NULL, NULL, NULL),
		(2, 'faith', 'A', 'Noun', 'update', '{"level":{"old":"1","value":"2"}}', NULL, NULL, 1, '2026-10-02T00:00:00.000Z', NULL),
		(3, 'faith', 'A', 'Noun', 'update', '{"level":{"old":"2","value":"1"}}', NULL, NULL, 1, '2026-09-01T00:00:00.000Z', '2026-09-01T00:00:00.000Z'),
		(4, 'faith', 'B', 'Noun', 'update', '{}', 2, '2026-10-01T00:00:00.000Z', NULL, NULL, NULL),
		(5, 'trust', 'A', 'Noun', 'update', '{}', 2, '2026-10-01T00:00:00.000Z', NULL, NULL, NULL)`

	it('returns only the unapplied changes to that exact concept, unapproved ones first', async () => {
		const { db, query } = create_test_db()
		query(changes)

		const pending = await get_pending_changes_for_concept({ db, concept_key: { stem: 'faith', sense: 'A', part_of_speech: 'Noun' } })

		expect(pending.map(({ id }) => id)).toEqual([1, 2])
		expect(pending[0].data).toEqual({ gloss: { old: 'trust in God', value: 'belief' } })
	})

	it('returns nothing for a concept with no pending changes', async () => {
		const { db, query } = create_test_db()
		query(changes)

		expect(await get_pending_changes_for_concept({ db, concept_key: { stem: 'trust', sense: 'B', part_of_speech: 'Noun' } })).toEqual([])
	})
})

describe('can_edit_change', () => {
	const suggestion = make_change({ suggested_by: { id: 2, name: 'suggester', date: new Date() } })

	it('lets the suggester edit their own suggestion', () => {
		expect(can_edit_change({ change: suggestion, user: { ...user, id: 2 } })).toBe(true)
	})

	it('lets anyone who could approve the suggestion edit it', () => {
		expect(can_edit_change({ change: suggestion, user: { ...user, permissions: { ...user.permissions, can_add: true } } })).toBe(true)
	})

	it('refuses anyone else', () => {
		expect(can_edit_change({ change: suggestion, user })).toBe(false)
	})

	it('refuses once the suggestion is approved, even for the suggester', () => {
		const change = { ...suggestion, approved_by: { name: 'approver', date: new Date() } }
		expect(can_edit_change({ change, user: { ...user, id: 2 } })).toBe(false)
	})

	it('refuses a change that was never suggested', () => {
		expect(can_edit_change({ change: make_change(), user: { ...user, permissions: { ...user.permissions, can_add: true } } })).toBe(false)
	})
})

describe('get_and_validate_change', () => {
	const changes = `INSERT INTO Changes (id, concept_stem, concept_sense, concept_part_of_speech, action, data, suggested_by_id, suggested_date, approved_by_id, approved_date) VALUES
		(1, 'peace', 'A', 'Noun', 'create', '{}', 1, '2026-10-01T00:00:00.000Z', NULL, NULL),
		(2, 'peace', 'A', 'Noun', 'create', '{}', 1, '2026-10-01T00:00:00.000Z', 3, '2026-10-02T00:00:00.000Z'),
		(3, 'peace', 'A', 'Noun', 'create', '{}', 2, '2026-10-01T00:00:00.000Z', NULL, NULL)`

	it("returns the user's own unapproved suggestion", async () => {
		const { db, query } = create_test_db()
		query(changes)

		expect(await get_and_validate_change({ id: 1, action: 'create', locals: create_locals(db) })).toMatchObject({ id: 1 })
	})

	it.each([
		{ reason: 'an id that is not an integer', id: 1.5, action: 'create', status: 400 },
		{ reason: 'a change that does not exist', id: 99, action: 'create', status: 404 },
		{ reason: 'the wrong action', id: 1, action: 'update', status: 400 },
		{ reason: 'an approved change', id: 2, action: 'create', status: 409 },
		{ reason: "someone else's suggestion", id: 3, action: 'create', status: 403 },
	] as const)('fails with $status for $reason', async ({ id, action, status }) => {
		const { db, query } = create_test_db()
		query(changes)

		await expect(get_and_validate_change({ id, action, locals: create_locals(db) })).rejects.toMatchObject({ status })
	})
})

describe('get_change_from_url', () => {
	const suggestion = `INSERT INTO Changes (id, concept_stem, concept_sense, concept_part_of_speech, action, data, suggested_by_id, suggested_date)
		VALUES (1, 'peace', 'A', 'Noun', 'create', '{}', 1, '2026-10-01T00:00:00.000Z')`

	it("returns null when there's no 'change' parameter", async () => {
		const { db } = create_test_db()

		expect(await get_change_from_url({ searchParams: new URLSearchParams(), action: 'create', locals: create_locals(db) })).toBeNull()
	})

	it("returns the editable change the 'change' parameter names", async () => {
		const { db, query } = create_test_db()
		query(suggestion)

		const change = await get_change_from_url({ searchParams: new URLSearchParams('change=1'), action: 'create', locals: create_locals(db) })

		expect(change).toMatchObject({ id: 1 })
	})

	it("fails with 400 for a 'change' parameter that is not a number", async () => {
		const { db } = create_test_db()

		await expect(get_change_from_url({ searchParams: new URLSearchParams('change=abc'), action: 'create', locals: create_locals(db) }))
			.rejects.toMatchObject({ status: 400 })
	})
})

describe('edit_suggested_change', () => {
	it('rewrites a suggested update in place, re-diffed against the current concept', async () => {
		const { db, query } = create_test_db()
		query(`INSERT INTO Changes (id, concept_stem, concept_sense, concept_part_of_speech, action, data, suggested_by_id, suggested_date)
			VALUES (1, 'faith', 'A', 'Noun', 'update', '{"gloss":{"old":"stale","value":"belief"}}', 2, '2026-10-01T00:00:00.000Z')`)
		const current = (await get_concept_for_update({ db, concept_key: { stem: 'faith', sense: 'A', part_of_speech: 'Noun' } }))!

		const applied = await edit_suggested_change({ db, id: 1, action: 'update', data: { ...current, level: '2' } })

		expect(applied).toBe(false)
		const change = await get_change({ db, id: 1 })
		expect(change).toMatchObject({ data: { level: { old: '1', value: '2' } }, suggested_by: { id: 2 }, approved_by: null })
		expect(query<{ count: number }>('SELECT COUNT(*) AS count FROM Changes')).toEqual([{ count: 1 }])
	})

	it('moves a suggested create to its edited concept key', async () => {
		const { db, query } = create_test_db()
		query(`INSERT INTO Changes (id, concept_stem, concept_sense, concept_part_of_speech, action, data, suggested_by_id, suggested_date)
			VALUES (1, 'peace', 'A', 'Noun', 'create', '{}', 2, '2026-10-01T00:00:00.000Z')`)

		await edit_suggested_change({ db, id: 1, action: 'create', data: { ...create_data, stem: 'calm' } })

		expect(await get_change({ db, id: 1 })).toMatchObject({
			concept: { stem: 'calm', sense: 'A', part_of_speech: 'Noun' },
			data: { gloss: { value: 'a state of calm' } },
		})
	})

	it('leaves an approved change alone', async () => {
		const { db, query } = create_test_db()
		query(`INSERT INTO Changes (id, concept_stem, concept_sense, concept_part_of_speech, action, data, suggested_by_id, suggested_date, approved_by_id, approved_date)
			VALUES (1, 'peace', 'A', 'Noun', 'create', '{}', 2, '2026-10-01T00:00:00.000Z', 1, '2026-10-02T00:00:00.000Z')`)

		await edit_suggested_change({ db, id: 1, action: 'create', data: create_data })

		expect((await get_change({ db, id: 1 }))!.data).toEqual({})
	})
})
