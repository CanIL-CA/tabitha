import { describe, expect, test } from 'bun:test'
import Database from 'bun:sqlite'
import { check_not_null_columns } from './validate'

describe('check_not_null_columns', () => {
	test('reports each column holding NULLs, and nothing for clean columns', () => {
		const db = new Database(':memory:')
		db.run('CREATE TABLE Concepts (stem TEXT, brief_gloss TEXT, categorization TEXT)')
		db.run('INSERT INTO Concepts VALUES (\'bring\', NULL, NULL), (\'aunt\', NULL, \'\'), (\'abandon\', \'leave\', \'AB\')')

		const failures = check_not_null_columns({ db, table: 'Concepts', columns: ['stem', 'brief_gloss', 'categorization'] })

		expect(failures).toEqual([
			'Concepts.brief_gloss has 2 NULL row(s)',
			'Concepts.categorization has 1 NULL row(s)',
		])
		db.close(true)
	})
})
