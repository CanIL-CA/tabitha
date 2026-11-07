import { describe, expect, test } from 'bun:test'
import { fixture_filename, trim_examples } from './fixture'

function example_insert({ stem, sense = 'A', part_of_speech = 'Noun', source = 'Bible', reference }: {
	stem: string
	sense?: string
	part_of_speech?: string
	source?: string
	reference: number
}): string {
	const columns = '"concept_stem","concept_sense","concept_part_of_speech","ref_type","ref_id_primary","ref_id_secondary","ref_id_tertiary","context_json"'
	return `INSERT INTO "Exhaustive_Examples" (${columns}) VALUES('${stem}','${sense}','${part_of_speech}','${source}',${reference},1,1,'{}');`
}

function examples_of({ sql, stem }: {
	sql: string
	stem: string
}): string[] {
	return sql.split('\n').filter(line => line.includes(`VALUES('${stem}',`))
}

describe('trim_examples', () => {
	test('keeps the first rows of each concept and source, in file order', () => {
		const sql = [1, 2, 3, 4].map(reference => example_insert({ stem: 'love', reference })).join('\n')

		const trimmed = trim_examples({ sql, per_concept_and_source: 2 })

		expect(trimmed).toBe([1, 2].map(reference => example_insert({ stem: 'love', reference })).join('\n'))
	})

	test('counts each concept, sense, part of speech and source on its own', () => {
		const sql = [
			example_insert({ stem: 'love', reference: 1 }),
			example_insert({ stem: 'love', reference: 2 }),
			example_insert({ stem: 'love', sense: 'B', reference: 3 }),
			example_insert({ stem: 'love', part_of_speech: 'Verb', reference: 4 }),
			example_insert({ stem: 'love', source: 'Other', reference: 5 }),
			example_insert({ stem: 'kill', reference: 6 }),
		].join('\n')

		const trimmed = trim_examples({ sql, per_concept_and_source: 1 })

		expect(trimmed.split('\n')).toHaveLength(5)
		expect(examples_of({ sql: trimmed, stem: 'love' })).toHaveLength(4)
		expect(examples_of({ sql: trimmed, stem: 'kill' })).toHaveLength(1)
	})

	test('keys on stems that contain an escaped quote', () => {
		const sql = [1, 2, 3].map(reference => example_insert({ stem: "o''clock", reference })).join('\n')

		expect(trim_examples({ sql, per_concept_and_source: 2 }).split('\n')).toHaveLength(2)
	})

	test('leaves every other line of the export as it is', () => {
		const other_lines = [
			'PRAGMA defer_foreign_keys=TRUE;',
			'CREATE TABLE Concepts (id INTEGER, gloss TEXT);',
			`INSERT INTO "Concepts" ("id","gloss") VALUES(1,'a'||char(10)||'b');`,
			'CREATE INDEX idx_exhaustive_examples_concept ON Exhaustive_Examples (concept_stem);',
		]
		const sql = [other_lines[0], other_lines[1], example_insert({ stem: 'love', reference: 1 }), other_lines[2], example_insert({ stem: 'love', reference: 2 }), other_lines[3]].join('\n')

		const trimmed = trim_examples({ sql, per_concept_and_source: 1 })

		expect(trimmed.split('\n').filter(line => !line.includes('Exhaustive_Examples"'))).toEqual(other_lines)
	})

	test('fails on an example row it cannot read instead of keeping or dropping it silently', () => {
		const sql = 'INSERT INTO "Exhaustive_Examples" ("concept_stem") VALUES(7);'

		expect(() => trim_examples({ sql, per_concept_and_source: 1 })).toThrow('Unrecognized Exhaustive_Examples row')
	})

	// A current `sqlite3 .dump` writes unistr() for control characters, and CI's older sqlite3 can't
	// load it. The trimmed export must stay the plain text the D1 export is.
	test('adds nothing to the export, so no unistr() appears', () => {
		const sql = example_insert({ stem: 'love', reference: 1 })

		expect(trim_examples({ sql, per_concept_and_source: 1 })).not.toContain('unistr(')
	})
})

describe('fixture_filename', () => {
	test('names the fixture after the snapshot version', () => {
		expect(fixture_filename({ version: '3-0-9533' })).toBe('Ontology_3-0-9533_fixture.tabitha.sqlite.sql')
	})
})
