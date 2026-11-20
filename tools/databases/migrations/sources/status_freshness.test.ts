import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { stale_status_csvs, stale_status_message } from './status_freshness'

const temp_dirs: string[] = []
afterEach(() => {
	while (temp_dirs.length > 0) rmSync(temp_dirs.pop()!, { recursive: true, force: true })
})

async function make_csv_dir(files: string[]): Promise<string> {
	const dir = mkdtempSync(join(tmpdir(), 'tabitha-status-'))
	temp_dirs.push(dir)
	await Promise.all(files.map(file => Bun.write(join(dir, file), '')))
	return dir
}

describe('stale_status_csvs', () => {
	it('reports nothing when both CSVs are dated for the run', async () => {
		const csv_dir = await make_csv_dir(['OT_verse_status_2026-11-19.csv', 'NT_verse_status_2026-11-19.csv'])

		expect(stale_status_csvs({ csv_dir, date: '2026-11-19' })).toEqual([])
	})

	it('reports the newest older CSV when the run date has none', async () => {
		const csv_dir = await make_csv_dir([
			'OT_verse_status_2026-06-25.csv',
			'OT_verse_status_2026-08-29.csv',
			'NT_verse_status_2026-11-19.csv',
		])

		expect(stale_status_csvs({ csv_dir, date: '2026-11-19' })).toEqual([{ prefix: 'OT_verse_status', latest_date: '2026-08-29' }])
	})

	it('ignores CSVs dated after the run, as the migration does', async () => {
		const csv_dir = await make_csv_dir([
			'OT_verse_status_2026-08-29.csv',
			'OT_verse_status_2026-12-01.csv',
			'NT_verse_status_2026-08-29.csv',
		])

		expect(stale_status_csvs({ csv_dir, date: '2026-11-19' })).toEqual([
			{ prefix: 'OT_verse_status', latest_date: '2026-08-29' },
			{ prefix: 'NT_verse_status', latest_date: '2026-08-29' },
		])
	})

	it('reports a missing CSV with no date', async () => {
		const csv_dir = await make_csv_dir(['NT_verse_status_2026-11-19.csv'])

		expect(stale_status_csvs({ csv_dir, date: '2026-11-19' })).toEqual([{ prefix: 'OT_verse_status', latest_date: undefined }])
	})
})

describe('stale_status_message', () => {
	it('names the dates in use and the follow-up steps', () => {
		const message = stale_status_message({ stale: [{ prefix: 'OT_verse_status', latest_date: '2026-08-29' }], date: '2026-11-19' })

		expect(message).toContain('OT_verse_status 2026-08-29')
		expect(message).toContain('migrate:status')
		expect(message).toContain('R2')
	})
})
