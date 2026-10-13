import { afterEach, describe, expect, it } from 'bun:test'
import Database from 'bun:sqlite'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { migrate_source_texts } from './migrate_source_texts'

const temp_dirs: string[] = []
afterEach(() => {
	while (temp_dirs.length > 0) rmSync(temp_dirs.pop()!, { recursive: true, force: true })
})

type TbtaRow = { table: string, reference: string | null, verse?: string | null, analyzed_verse?: string | null, notes?: string | null }

function make_tbta_source_db({ source_name, rows }: {
	source_name: string
	rows: TbtaRow[]
}): string {
	const dir = mkdtempSync(join(tmpdir(), 'tabitha-source-test-'))
	temp_dirs.push(dir)
	const path = join(dir, `${source_name}_2026-01-01.tbta.sqlite`)

	const db = new Database(path)
	const tables = [...new Set(rows.map(row => row.table))]
	for (const table of tables) {
		db.run(`CREATE TABLE '${table}' (Reference TEXT, Verse TEXT, AnalyzedVerse TEXT, Notes TEXT)`)
	}
	for (const row of rows) {
		db.run(`INSERT INTO '${row.table}' (Reference, Verse, AnalyzedVerse, Notes) VALUES (?, ?, ?, ?)`, [
			row.reference, row.verse ?? null, row.analyzed_verse ?? null, row.notes ?? null,
		])
	}
	// close(true), not close(): the default defers the actual release until every statement is
	// finalized or GC'd, and on Windows the file stays locked until then -- which blocks afterEach's
	// rmSync of the temp directory this file lives in.
	db.close(true)

	return path
}

function read_sources_rows(db: Database) {
	return db.query<{ type: string, id_primary: string, id_secondary: string, id_tertiary: string, phase_1_encoding: string, semantic_encoding: string, notes: string }, []>(`
		SELECT type, id_primary, id_secondary, id_tertiary, phase_1_encoding, semantic_encoding, notes FROM Sources
	`).all()
}

describe('migrate_source_texts', () => {
	it('parses "Book Chapter:Verse" references into id_primary/id_secondary/id_tertiary', () => {
		const db = new Database(':memory:')
		const path = make_tbta_source_db({ source_name: 'Bible', rows: [
			{ table: 'Daniel', reference: 'Daniel 3:9', verse: 'They said to Nebuchadnezzar the king.', analyzed_verse: '[analyzed]' },
		] })

		migrate_source_texts({ tabitha_sources_db: db, tbta_sources_from_input: [path] })

		expect(read_sources_rows(db)).toEqual([
			{ type: 'Bible', id_primary: 'Daniel', id_secondary: '3', id_tertiary: '9', phase_1_encoding: 'They said to Nebuchadnezzar the king.', semantic_encoding: '[analyzed]', notes: '' },
		])
	})

	it('skips rows with no Reference', () => {
		const db = new Database(':memory:')
		const path = make_tbta_source_db({ source_name: 'Bible', rows: [
			{ table: 'Daniel', reference: null, verse: 'orphaned verse text' },
			{ table: 'Daniel', reference: 'Daniel 3:9', verse: 'They said to Nebuchadnezzar the king.' },
		] })

		migrate_source_texts({ tabitha_sources_db: db, tbta_sources_from_input: [path] })

		expect(read_sources_rows(db)).toHaveLength(1)
	})

	it('trims whitespace garbage from the verse text and cleans notes', () => {
		const db = new Database(':memory:')
		const path = make_tbta_source_db({ source_name: 'Bible', rows: [
			{ table: 'Daniel', reference: 'Daniel 3:9', verse: '  They said to Nebuchadnezzar the king.  \n', notes: 'Some note\r\n with a carriage return.  ' },
		] })

		migrate_source_texts({ tabitha_sources_db: db, tbta_sources_from_input: [path] })

		const [row] = read_sources_rows(db)
		expect(row.phase_1_encoding).toBe('They said to Nebuchadnezzar the king.')
		expect(row.notes).toBe('Some note\n with a carriage return.')
	})

	it('derives the source type from the first underscore-delimited segment of the filename', () => {
		const db = new Database(':memory:')
		const path = make_tbta_source_db({ source_name: 'CommunityDevelopmentTexts', rows: [
			{ table: 'Lesson1', reference: 'Lesson1 1:1', verse: 'Some community text.' },
		] })

		migrate_source_texts({ tabitha_sources_db: db, tbta_sources_from_input: [path] })

		expect(read_sources_rows(db)[0].type).toBe('CommunityDevelopmentTexts')
	})

	it('combines rows from multiple input source databases into one Sources table', () => {
		const db = new Database(':memory:')
		const bible_path = make_tbta_source_db({ source_name: 'Bible', rows: [{ table: 'Genesis', reference: 'Genesis 1:1', verse: 'In the beginning.' }] })
		const grammar_path = make_tbta_source_db({ source_name: 'GrammarIntroduction', rows: [{ table: 'Intro', reference: 'Intro 1:1', verse: 'Welcome to the grammar.' }] })

		migrate_source_texts({ tabitha_sources_db: db, tbta_sources_from_input: [bible_path, grammar_path] })

		const rows = read_sources_rows(db)
		expect(rows).toHaveLength(2)
		expect(rows.map(r => r.type).sort()).toEqual(['Bible', 'GrammarIntroduction'])
	})

	it('clears out prior rows on a re-run instead of accumulating duplicates', () => {
		const db = new Database(':memory:')
		const path = make_tbta_source_db({ source_name: 'Bible', rows: [{ table: 'Genesis', reference: 'Genesis 1:1', verse: 'In the beginning.' }] })

		migrate_source_texts({ tabitha_sources_db: db, tbta_sources_from_input: [path] })
		migrate_source_texts({ tabitha_sources_db: db, tbta_sources_from_input: [path] })

		expect(read_sources_rows(db)).toHaveLength(1)
	})

	it('preserves another type\'s rows when reprocessing just one type (incremental rebuild)', () => {
		const db = new Database(':memory:')
		const bible_path = make_tbta_source_db({ source_name: 'Bible', rows: [{ table: 'Genesis', reference: 'Genesis 1:1', verse: 'In the beginning.' }] })
		const grammar_path = make_tbta_source_db({ source_name: 'GrammarIntroduction', rows: [{ table: 'Intro', reference: 'Intro 1:1', verse: 'Welcome to the grammar.' }] })

		migrate_source_texts({ tabitha_sources_db: db, tbta_sources_from_input: [bible_path, grammar_path] })

		// Re-run only Bible, as an incremental rebuild would when only Bible's raw input changed.
		const bible_path_updated = make_tbta_source_db({ source_name: 'Bible', rows: [{ table: 'Genesis', reference: 'Genesis 1:1', verse: 'In the beginning, revised.' }] })
		migrate_source_texts({ tabitha_sources_db: db, tbta_sources_from_input: [bible_path_updated] })

		const rows = read_sources_rows(db)
		expect(rows).toHaveLength(2)
		expect(rows.find(r => r.type === 'Bible')?.phase_1_encoding).toBe('In the beginning, revised.')
		expect(rows.find(r => r.type === 'GrammarIntroduction')?.phase_1_encoding).toBe('Welcome to the grammar.')
	})
})
