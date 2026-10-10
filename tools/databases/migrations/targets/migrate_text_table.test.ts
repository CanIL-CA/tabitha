import { describe, expect, it } from 'bun:test'
import Database from 'bun:sqlite'
import { migrate_text_table } from './migrate_text_table'

function make_tbta_db({ audiences, tables }: {
	audiences: string[]
	tables: Record<string, { reference: string, verse: string | null }[]>
}): Database {
	const db = new Database(':memory:')

	db.run('CREATE TABLE Properties (Audiences TEXT)')
	const audiences_field = audiences.map(name => `^${name};`).join('')
	db.run('INSERT INTO Properties (Audiences) VALUES (?)', [audiences_field])

	for (const [table_name, rows] of Object.entries(tables)) {
		db.run(`CREATE TABLE ${table_name} (Reference TEXT, Verse TEXT)`)
		for (const row of rows) {
			db.run(`INSERT INTO ${table_name} (Reference, Verse) VALUES (?, ?)`, [row.reference, row.verse])
		}
	}

	return db
}

function read_text_rows(targets_db: Database) {
	return targets_db.query<{ project: string, book: string, chapter: number, verse: number, audience: string, text: string }, []>(`
		SELECT project, book, chapter, verse, audience, text FROM Text ORDER BY book, chapter, verse, audience
	`).all()
}

describe('migrate_text_table', () => {
	it('parses "Book Chapter:Verse" references and splits per-audience lines correctly', () => {
		const tbta_db = make_tbta_db({
			audiences: ['Literal', 'Unchurched Adults'],
			tables: { Target_EB_Genesis: [{ reference: 'Genesis 1:1', verse: 'In the beginning God created.\nLong ago, God made everything.' }] },
		})
		const targets_db = new Database(':memory:')

		migrate_text_table({ tbta_db, project: 'English', targets_db })

		expect(read_text_rows(targets_db)).toEqual([
			{ project: 'English', book: 'Genesis', chapter: 1, verse: 1, audience: 'Literal', text: 'In the beginning God created.' },
			{ project: 'English', book: 'Genesis', chapter: 1, verse: 1, audience: 'Unchurched Adults', text: 'Long ago, God made everything.' },
		])
	})

	it('skips the legacy-named duplicate book tables so their rows are not migrated twice', () => {
		const tbta_db = make_tbta_db({
			audiences: ['Literal'],
			tables: {
				Target_EB_Revelation: [{ reference: 'Revelation 1:1', verse: 'The revelation of Jesus Christ.' }],
				Target_EB_Revelations: [{ reference: 'Revelation 1:1', verse: 'The revelation of Jesus Christ.' }],
				Target_EB_Psalms: [{ reference: 'Psalms 23:1', verse: 'The Lord is my shepherd.' }],
				Target_EB_Psalm: [{ reference: 'Psalms 23:1', verse: 'The Lord is my shepherd.' }],
			},
		})
		const targets_db = new Database(':memory:')

		migrate_text_table({ tbta_db, project: 'English', targets_db })

		const rows = read_text_rows(targets_db)
		expect(rows).toHaveLength(2)
		expect(rows.filter(r => r.book === 'Revelation')).toHaveLength(1)
		expect(rows.filter(r => r.book === 'Psalms')).toHaveLength(1)
	})

	it('skips blank audience lines and strips inline "~!~" annotation markers', () => {
		const tbta_db = make_tbta_db({
			audiences: ['Literal', 'Annotated', 'Unchurched Adults'],
			tables: { Target_EB_Genesis: [{ reference: 'Genesis 1:1', verse: 'In the beginning.\n\nGod made it.~!~note: creation account' }] },
		})
		const targets_db = new Database(':memory:')

		migrate_text_table({ tbta_db, project: 'English', targets_db })

		const rows = read_text_rows(targets_db)
		expect(rows).toEqual([
			{ project: 'English', book: 'Genesis', chapter: 1, verse: 1, audience: 'Literal', text: 'In the beginning.' },
			{ project: 'English', book: 'Genesis', chapter: 1, verse: 1, audience: 'Unchurched Adults', text: 'God made it.' },
		])
	})

	it('skips rows with a null Verse', () => {
		const tbta_db = make_tbta_db({
			audiences: ['Literal'],
			tables: { Target_EB_Genesis: [{ reference: 'Genesis 1:1', verse: null }] },
		})
		const targets_db = new Database(':memory:')

		migrate_text_table({ tbta_db, project: 'English', targets_db })

		expect(read_text_rows(targets_db)).toEqual([])
	})

	it('tags every migrated row with the given project', () => {
		const tbta_db = make_tbta_db({
			audiences: ['Literal'],
			tables: { Target_EB_Genesis: [{ reference: 'Genesis 1:1', verse: 'Mwanzoni Mungu aliumba.' }] },
		})
		const targets_db = new Database(':memory:')

		migrate_text_table({ tbta_db, project: 'Swahili', targets_db })

		expect(read_text_rows(targets_db)).toEqual([
			{ project: 'Swahili', book: 'Genesis', chapter: 1, verse: 1, audience: 'Literal', text: 'Mwanzoni Mungu aliumba.' },
		])
	})

	it('replaces a project\'s own rows rather than duplicating them on a second run', () => {
		const targets_db = new Database(':memory:')

		const first_run = make_tbta_db({ audiences: ['Literal'], tables: { Target_EB_Genesis: [{ reference: 'Genesis 1:1', verse: 'In the beginning.' }] } })
		migrate_text_table({ tbta_db: first_run, project: 'English', targets_db })

		const second_run = make_tbta_db({ audiences: ['Literal'], tables: { Target_EB_Genesis: [{ reference: 'Genesis 1:1', verse: 'In the beginning, revised.' }] } })
		migrate_text_table({ tbta_db: second_run, project: 'English', targets_db })

		expect(read_text_rows(targets_db)).toEqual([
			{ project: 'English', book: 'Genesis', chapter: 1, verse: 1, audience: 'Literal', text: 'In the beginning, revised.' },
		])
	})

	it('preserves another project\'s rows when reprocessing just one project (incremental rebuild)', () => {
		const targets_db = new Database(':memory:')

		const english_db = make_tbta_db({ audiences: ['Literal'], tables: { Target_EB_Genesis: [{ reference: 'Genesis 1:1', verse: 'In the beginning.' }] } })
		migrate_text_table({ tbta_db: english_db, project: 'English', targets_db })

		const swahili_db = make_tbta_db({ audiences: ['Literal'], tables: { Target_EB_Genesis: [{ reference: 'Genesis 1:1', verse: 'Mwanzoni.' }] } })
		migrate_text_table({ tbta_db: swahili_db, project: 'Swahili', targets_db })

		// Re-run only Swahili, as an incremental rebuild would when only Swahili's raw input changed.
		const swahili_db_updated = make_tbta_db({ audiences: ['Literal'], tables: { Target_EB_Genesis: [{ reference: 'Genesis 1:1', verse: 'Mwanzoni, revised.' }] } })
		migrate_text_table({ tbta_db: swahili_db_updated, project: 'Swahili', targets_db })

		expect(read_text_rows(targets_db)).toEqual([
			{ project: 'English', book: 'Genesis', chapter: 1, verse: 1, audience: 'Literal', text: 'In the beginning.' },
			{ project: 'Swahili', book: 'Genesis', chapter: 1, verse: 1, audience: 'Literal', text: 'Mwanzoni, revised.' },
		])
	})
})
