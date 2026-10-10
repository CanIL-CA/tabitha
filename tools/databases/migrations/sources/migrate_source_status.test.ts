import { afterEach, describe, expect, it } from 'bun:test'
import Database from 'bun:sqlite'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { migrate_source_status } from './migrate_source_status'
import { bun_sqlite_runner, collecting_sql_runner, render_sql_file } from './sql_runner'

const temp_dirs: string[] = []
afterEach(() => {
	while (temp_dirs.length > 0) rmSync(temp_dirs.pop()!, { recursive: true, force: true })
})

function make_csv_dir({ date, ot = '', nt = '', with_date_column = true }: {
	date: string
	ot?: string
	nt?: string
	with_date_column?: boolean
}): string {
	const dir = mkdtempSync(join(tmpdir(), 'tabitha-status-test-'))
	temp_dirs.push(dir)

	const header = with_date_column ? 'ProjectStatusDate,StatusDetail,ProjectName,VerseCount\n' : 'StatusDetail,ProjectName,VerseCount\n'
	writeFileSync(join(dir, `OT_verse_status_${date}.csv`), header + ot)
	writeFileSync(join(dir, `NT_verse_status_${date}.csv`), header + nt)

	return dir
}

describe('migrate_source_status', () => {
	it('applies statuses in-process against a bun:sqlite database via bun_sqlite_runner', async () => {
		const db = new Database(':memory:')
		db.run('CREATE TABLE Sources (type TEXT, id_primary TEXT, id_secondary TEXT, id_tertiary TEXT, status TEXT)')
		db.run("INSERT INTO Sources VALUES ('Bible', 'Genesis', '1', '1', '')")

		const date = '2026-08-29'
		const csv_dir = make_csv_dir({ date, ot: '"May 1, 2026, 12:00:00 AM",Complete,Genesis 1:1-10,10\n' })

		await migrate_source_status({ runner: bun_sqlite_runner(db), csv_dir, date })

		expect(db.query('SELECT status FROM Sources').get()).toEqual({ status: 'Ready to Translate' })
	})

	it('parses rows correctly when the CSV export has no leading ProjectStatusDate column', async () => {
		const db = new Database(':memory:')
		db.run('CREATE TABLE Sources (type TEXT, id_primary TEXT, id_secondary TEXT, id_tertiary TEXT, status TEXT)')
		db.run("INSERT INTO Sources VALUES ('Bible', 'Genesis', '1', '1', '')")

		const date = '2026-04-09'
		// Real exports have used both formats across different dates -- this one, without the date
		// column, previously caused every status word to be parsed one character short (e.g.
		// "Previously Complete" -> "reviously Complete"), silently falling back to "Not Started" for
		// nearly every row.
		const csv_dir = make_csv_dir({ date, ot: 'Previously Complete,Genesis 1:1-10,10\n', with_date_column: false })

		await migrate_source_status({ runner: bun_sqlite_runner(db), csv_dir, date })

		expect(db.query('SELECT status FROM Sources').get()).toEqual({ status: 'Ready to Translate' })
	})

	it('maps "Phase 1 Sign-off" to "Initial Analysis Complete"', async () => {
		const db = new Database(':memory:')
		db.run('CREATE TABLE Sources (type TEXT, id_primary TEXT, id_secondary TEXT, id_tertiary TEXT, status TEXT)')
		db.run("INSERT INTO Sources VALUES ('Bible', 'Genesis', '1', '1', '')")

		const date = '2026-08-29'
		const csv_dir = make_csv_dir({ date, ot: '"Aug 21, 2026, 12:00:00 AM",Phase 1 Sign-off,Genesis 1:1-10,10\n' })

		await migrate_source_status({ runner: bun_sqlite_runner(db), csv_dir, date })

		expect(db.query('SELECT status FROM Sources').get()).toEqual({ status: 'Initial Analysis Complete' })
	})

	it('collects the same statements without executing them, and they apply cleanly when rendered and run against sqlite', async () => {
		const date = '2026-08-29'
		const csv_dir = make_csv_dir({ date, ot: '"May 1, 2026, 12:00:00 AM",Complete,Genesis 1:1-10,10\n' })

		const runner = collecting_sql_runner()
		await migrate_source_status({ runner, csv_dir, date })

		expect(runner.statements.length).toBeGreaterThan(0)

		const db = new Database(':memory:')
		db.run('CREATE TABLE Sources (type TEXT, id_primary TEXT, id_secondary TEXT, id_tertiary TEXT, status TEXT)')
		db.run("INSERT INTO Sources VALUES ('Bible', 'Genesis', '1', '1', '')")

		db.run(render_sql_file(runner.statements))

		expect(db.query('SELECT status FROM Sources').get()).toEqual({ status: 'Ready to Translate' })
		expect(db.query('SELECT * FROM ChapterStatus').all()).toEqual([
			{ type: 'Bible', id_primary: 'Genesis', id_secondary: '1', status: 'Ready to Translate' },
		])
	})

	it('produces identical Sources updates whether run via bun_sqlite_runner or collecting_sql_runner + render', async () => {
		const date = '2026-08-29'
		const csv_dir = make_csv_dir({
			date,
			ot: '"May 1, 2026, 12:00:00 AM",Complete,Genesis 1:1-10,10\n"May 1, 2026, 12:00:00 AM",Drafter [HE1],Genesis 1:11-20,10\n',
		})

		function fresh_db() {
			const db = new Database(':memory:')
			db.run('CREATE TABLE Sources (type TEXT, id_primary TEXT, id_secondary TEXT, id_tertiary TEXT, status TEXT)')
			db.run("INSERT INTO Sources VALUES ('Bible', 'Genesis', '1', '5', '')")
			db.run("INSERT INTO Sources VALUES ('Bible', 'Genesis', '1', '15', '')")
			return db
		}

		const direct_db = fresh_db()
		await migrate_source_status({ runner: bun_sqlite_runner(direct_db), csv_dir, date })

		const collecting = collecting_sql_runner()
		await migrate_source_status({ runner: collecting, csv_dir, date })
		const rendered_db = fresh_db()
		rendered_db.run(render_sql_file(collecting.statements))

		const direct_rows = direct_db.query('SELECT id_tertiary, status FROM Sources ORDER BY id_tertiary').all()
		const rendered_rows = rendered_db.query('SELECT id_tertiary, status FROM Sources ORDER BY id_tertiary').all()
		expect(rendered_rows).toEqual(direct_rows)
	})
})
