import { describe, expect, it } from 'bun:test'
import { extract_literals, extract_svelte_script, find_lowercase_keywords, find_sql_keyword_findings } from './check_sql_keyword_case'

function keywords_of({ file_path, content }: { file_path: string; content: string }) {
	return find_sql_keyword_findings({ file_path, content }).map(({ keyword }) => keyword)
}

describe('find_lowercase_keywords', () => {
	it('passes ALL CAPS SQL', () => {
		expect(find_lowercase_keywords('CREATE TABLE IF NOT EXISTS Users (id INTEGER PRIMARY KEY, email TEXT);')).toEqual([])
	})

	it('flags each lowercase keyword with its line', () => {
		expect(find_lowercase_keywords('SELECT id\nfrom Users\nwhere id = 1')).toEqual([{ line: 2, keyword: 'from' }, { line: 3, keyword: 'where' }])
	})

	it('ignores keywords inside comments, string values and quoted identifiers', () => {
		expect(find_lowercase_keywords("-- select from where\nSELECT \"order\" FROM Users /* and or */ WHERE name = 'select it'")).toEqual([])
	})

	it('ignores lowercase identifiers, dotted names and function calls', () => {
		expect(find_lowercase_keywords('SELECT t.order, left(name, 1), key, text FROM t')).toEqual([])
	})
})

describe('extract_literals', () => {
	it('skips comments, blanks ${} holes and tracks lines', () => {
		const source = "// 'select from'\nconst a = 'one'\n/* \"two\" */\nconst b = `three ${ 'select' } four`"
		expect(extract_literals(source)).toEqual([{ text: 'one', line: 2 }, { text: `three ${' '.repeat(13)} four`, line: 4 }])
	})
})

describe('extract_svelte_script', () => {
	it('keeps only script content, in place', () => {
		const svelte = "<script lang=\"ts\">\n\tconst q = 'x'\n</script>\n<p class='select'>hi</p>"
		expect(extract_literals(extract_svelte_script(svelte))).toEqual([{ text: 'x', line: 2 }])
	})
})

describe('find_sql_keyword_findings', () => {
	it('checks .sql files whole', () => {
		expect(keywords_of({ file_path: 'migrations/0003.sql', content: 'create table T (id integer);' })).toEqual(['create', 'table', 'integer'])
	})

	it('checks SQL statements inside template literals, with the right line', () => {
		const content = 'const rows = await db.prepare(`\n\tSELECT id\n\tfrom Users\n`).all()'
		expect(find_sql_keyword_findings({ file_path: 'a.ts', content })).toEqual([{ file_path: 'a.ts', line: 3, keyword: 'from' }])
	})

	it('leaves prose and SQL fragments alone', () => {
		const content = "const message = 'select the verse from the list'\nconst clause = 'where x = 1'\nthrow new Error('update the table or delete it')"
		expect(keywords_of({ file_path: 'a.ts', content })).toEqual([])
	})

	it('flags SQL in a .svelte script', () => {
		expect(keywords_of({ file_path: 'A.svelte', content: "<script>\n\tconst q = 'SELECT id from T'\n</script>" })).toEqual(['from'])
	})

	it('skips generated files', () => {
		expect(keywords_of({ file_path: 'apps/ontology/migrations/auth/0001_better_auth.sql', content: 'create table "user" ("id" text);' })).toEqual([])
	})
})
