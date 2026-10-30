import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { D1DatabaseSession } from '@cloudflare/workers-types'
import { compare_stems, get_stem_senses } from './concepts'

describe('compare_stems', () => {
	it("orders characters by TBTA's custom sequence, not standard alphabetical order", () => {
		// In the custom sequence '-0123456789abc...', '-' sorts before digits, which sort before letters.
		expect(compare_stems({ a: '-abc', b: 'abc' })).toBeLessThan(0)
		expect(compare_stems({ a: '9', b: 'a' })).toBeLessThan(0)
		expect(compare_stems({ a: 'a', b: '9' })).toBeGreaterThan(0)
	})

	it('returns 0 for identical stems', () => {
		expect(compare_stems({ a: 'love', b: 'love' })).toBe(0)
	})

	it('ignores characters not present in the sorting sequence, e.g. spaces and punctuation', () => {
		// Note: '-' is itself part of the sequence (its first/lowest-ranked character), so it is
		// deliberately excluded from this example -- only truly absent characters are ignored.
		expect(compare_stems({ a: 'a b!c', b: 'abc' })).toBe(0)
	})

	it('is case-sensitive on its own; callers are expected to lowercase both inputs first', () => {
		// The sorting sequence only contains lowercase letters, so an uppercase letter is treated as
		// "not in the sequence" and skipped, the same as a space or punctuation mark would be.
		expect(compare_stems({ a: 'ABC', b: 'abc' })).not.toBe(0)
	})

	it('treats a shorter stem (in valid characters) as sorting first when it is a prefix of the longer one', () => {
		expect(compare_stems({ a: 'cat', b: 'catalog' })).toBeLessThan(0)
		expect(compare_stems({ a: 'catalog', b: 'cat' })).toBeGreaterThan(0)
	})

	it('is usable as an Array.prototype.sort comparator when wrapped to match its positional callback shape', () => {
		const stems = ['zebra', 'apple', '9lives', '-hyphen']
		stems.sort((a, b) => compare_stems({ a, b }))

		expect(stems).toEqual(['-hyphen', '9lives', 'apple', 'zebra'])
	})
})

// The columns get_stem_senses reads, as they're defined in the Ontology snapshots (tools/databases/snapshots)
const SCHEMA = `
	CREATE TABLE Concepts (id INTEGER, stem TEXT, sense TEXT, part_of_speech TEXT, gloss TEXT, level INTEGER);
	CREATE TABLE Changes (id INTEGER PRIMARY KEY, concept_stem TEXT, concept_sense TEXT, concept_part_of_speech TEXT, action TEXT, data TEXT, approved_date TEXT, applied_date TEXT);
	INSERT INTO Concepts VALUES (1, 'run', 'A', 'Verb', '(simple) to move fast', 1);
	INSERT INTO Concepts VALUES (2, 'run', 'B', 'Verb', '(complex) to manage', 2);
	INSERT INTO Concepts VALUES (3, 'run', 'A', 'Noun', '(simple) a fast race', 1);
	INSERT INTO Concepts VALUES (4, 'Run', 'A', 'Verb', '(proper name) a place', 4);
	INSERT INTO Changes VALUES (1, 'run', 'C', 'Verb', 'create', '{"gloss":{"value":"(simple) to flow"}}', NULL, NULL);
	INSERT INTO Changes VALUES (2, 'run', 'D', 'Verb', 'create', '{"gloss":{"value":"(complex) to campaign"}}', '2026-10-01', NULL);
	INSERT INTO Changes VALUES (3, 'run', 'E', 'Verb', 'create', '{"gloss":{"value":"already applied"}}', '2026-10-01', '2026-10-02');
	INSERT INTO Changes VALUES (4, 'run', 'A', 'Verb', 'update', '{"gloss":{"value":"an edit"}}', NULL, NULL);
`

// Wraps an in-memory SQLite database in the slice of D1's session API that get_stem_senses uses
function create_test_db(): D1DatabaseSession {
	const sqlite = new DatabaseSync(':memory:')
	sqlite.exec(SCHEMA)

	return {
		prepare: (sql: string) => ({
			bind: (...params: SQLInputValue[]) => ({
				all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
			}),
		}),
	} as unknown as D1DatabaseSession
}

describe('get_stem_senses', () => {
	it('lists the senses in the Ontology and the unapplied creates for the exact stem and part of speech', async () => {
		const senses = await get_stem_senses({ db: create_test_db(), stem: 'run', part_of_speech: 'Verb' })

		expect(senses).toEqual([
			{ sense: 'A', gloss: '(simple) to move fast', status: 'in ontology' },
			{ sense: 'B', gloss: '(complex) to manage', status: 'in ontology' },
			{ sense: 'C', gloss: '(simple) to flow', status: 'suggested', change_id: 1 },
			{ sense: 'D', gloss: '(complex) to campaign', status: 'approved', change_id: 2 },
		])
	})

	it('returns nothing for a stem with no senses', async () => {
		expect(await get_stem_senses({ db: create_test_db(), stem: 'walk', part_of_speech: 'Verb' })).toEqual([])
	})
})
