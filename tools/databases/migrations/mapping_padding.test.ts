import { afterEach, describe, expect, it } from 'bun:test'
import { Database } from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { pad_mapping_tables } from './mapping_padding'

const temp_dirs: string[] = []
afterEach(() => {
	while (temp_dirs.length > 0) rmSync(temp_dirs.pop()!, { recursive: true, force: true })
})

function make_language_db(): string {
	const dir = mkdtempSync(join(tmpdir(), 'tabitha-mapping-padding-'))
	temp_dirs.push(dir)
	const db_path = join(dir, 'English.sqlite')
	const db = new Database(db_path)
	db.run('CREATE TABLE Adjective_Mappings_English (ID INTEGER, Mappings NVARCHAR(255), [Expansion Rule] NVARCHAR, [Expansion Rule BreakPoint] INT16)')
	db.run("INSERT INTO Adjective_Mappings_English VALUES (1, 'a', 'rule', 3), (2, '', '', 0)")
	db.run('CREATE TABLE Verb_Mappings_Greek (ID INTEGER, Mappings NVARCHAR(255))')
	db.run('CREATE TABLE Adjectives (ID INTEGER, Roots NVARCHAR)')
	db.run("INSERT INTO Adjectives VALUES (1, 'zealous')")
	db.close()
	return db_path
}

function rows({ db_path, table }: { db_path: string, table: string }): unknown[] {
	const db = new Database(db_path, { readonly: true })
	try {
		return db.query(`SELECT * FROM [${table}] ORDER BY ID`).all()
	} finally {
		db.close()
	}
}

describe('pad_mapping_tables', () => {
	it('adds one blank row past the last ID, blank text and zero numbers', () => {
		const db_path = make_language_db()

		pad_mapping_tables({ db_path })

		expect(rows({ db_path, table: 'Adjective_Mappings_English' })).toEqual([
			{ 'ID': 1, 'Mappings': 'a', 'Expansion Rule': 'rule', 'Expansion Rule BreakPoint': 3 },
			{ 'ID': 2, 'Mappings': '', 'Expansion Rule': '', 'Expansion Rule BreakPoint': 0 },
			{ 'ID': 3, 'Mappings': '', 'Expansion Rule': '', 'Expansion Rule BreakPoint': 0 },
		])
	})

	it('pads every language and part of speech, including an empty table', () => {
		const db_path = make_language_db()

		const padded = pad_mapping_tables({ db_path })

		expect(padded.sort()).toEqual(['Adjective_Mappings_English', 'Verb_Mappings_Greek'])
		expect(rows({ db_path, table: 'Verb_Mappings_Greek' })).toEqual([{ ID: 1, Mappings: '' }])
	})

	it('leaves tables other than mappings alone', () => {
		const db_path = make_language_db()

		pad_mapping_tables({ db_path })

		expect(rows({ db_path, table: 'Adjectives' })).toEqual([{ ID: 1, Roots: 'zealous' }])
	})
})
