import { $, Glob } from 'bun'
import Database from 'bun:sqlite'
import { existsSync } from 'fs'
import { unlink } from 'fs/promises'
import { BIBLE_BOOKS } from '@tabitha/types/patterns'
import { create_logger } from './log'

const log = create_logger('Validation')

// A migration run that loses more than this fraction of a table's prior row count is treated as
// data loss (e.g. a source silently failed to load) rather than expected content growth.
const ROW_COUNT_DROP_THRESHOLD = 0.15

type BookCheckConfig = {
	table: string
	book_column: string
	/** Restricts the book check to rows that actually represent Bible books, e.g. "type = 'Bible'". */
	where?: string
	/**
	 * Whether every canonical book must be present. True for a complete source text (Sources);
	 * false for per-language translation output (Targets), where partial book coverage is normal.
	 */
	require_complete: boolean
}

type DuplicateCheckConfig = {
	table: string
	columns: string[]
}

type NotNullCheckConfig = {
	table: string
	columns: string[]
}

export type ValidationConfig = {
	book_check?: BookCheckConfig
	duplicate_check?: DuplicateCheckConfig
	/** Columns the consuming app reads as always-present, so a NULL would break it at runtime. */
	not_null_checks?: NotNullCheckConfig[]
	row_count_table: string
}

/**
 * Runs the configured checks against a freshly-migrated Tabitha database and throws if any of
 * them fail, so a bad migration output is caught before it ever reaches a D1 deploy.
 */
export async function validate_migration_output({ key, db_path, date, config }: {
	key: string
	db_path: string
	date: string
	config: ValidationConfig
}): Promise<void> {
	log.step(`Validating ${key} migration output...`)

	const db = new Database(db_path, { readonly: true })
	const failures: string[] = []

	try {
		if (config.book_check) {
			failures.push(...check_canonical_books({ db, ...config.book_check }))
		}

		if (config.duplicate_check) {
			failures.push(...check_duplicate_rows({ db, ...config.duplicate_check }))
		}

		for (const not_null_check of config.not_null_checks ?? []) {
			failures.push(...check_not_null_columns({ db, ...not_null_check }))
		}

		const row_count_failure = await check_row_count_sanity({ db, table: config.row_count_table, key, date })
		if (row_count_failure) failures.push(row_count_failure)
	} finally {
		db.close()
	}

	if (failures.length > 0) {
		for (const failure of failures) log.error(failure)
		throw new Error(`${key} migration output failed validation (${failures.length} issue${failures.length === 1 ? '' : 's'}) -- see errors above.`)
	}

	log.success(`${key} migration output passed validation.`)
}

function check_canonical_books({ db, table, book_column, where, require_complete }: BookCheckConfig & { db: Database }): string[] {
	const clause = where ? `WHERE ${where}` : ''
	const rows = db.query<{ book: string }, []>(`SELECT DISTINCT ${book_column} AS book FROM ${table} ${clause}`).all()
	const found = new Set(rows.map(row => row.book))
	const canonical = new Set(Object.values(BIBLE_BOOKS))

	const unexpected = [...found].filter(book => !canonical.has(book))

	const failures: string[] = []
	if (unexpected.length > 0) {
		failures.push(`${table}.${book_column} has ${unexpected.length} non-canonical book name(s), likely a misspelling or bad export: ${unexpected.join(', ')}`)
	}

	if (require_complete) {
		const missing = [...canonical].filter(book => !found.has(book))
		if (missing.length > 0) {
			failures.push(`${table}.${book_column} is missing ${missing.length} canonical book(s): ${missing.join(', ')}`)
		}
	}

	return failures
}

function check_duplicate_rows({ db, table, columns }: DuplicateCheckConfig & { db: Database }): string[] {
	const column_list = columns.join(', ')
	const rows = db.query<Record<string, string | number>, []>(`
		SELECT ${column_list}, COUNT(*) AS dupe_count
		FROM ${table}
		GROUP BY ${column_list}
		HAVING COUNT(*) > 1
	`).all()

	if (rows.length === 0) return []

	const examples = rows.slice(0, 5).map(row => `(${columns.map(column => row[column]).join(', ')}) x${row.dupe_count}`).join('; ')
	return [`${table} has ${rows.length} duplicate row(s) on (${column_list}), e.g. ${examples}`]
}

export function check_not_null_columns({ db, table, columns }: NotNullCheckConfig & { db: Database }): string[] {
	const null_counts = columns.map(column => ({
		column,
		count: db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${table} WHERE ${column} IS NULL`).get()?.count ?? 0,
	}))

	return null_counts
		.filter(({ count }) => count > 0)
		.map(({ column, count }) => `${table}.${column} has ${count} NULL row(s)`)
}

async function check_row_count_sanity({ db, table, key, date }: {
	db: Database
	table: string
	key: string
	date: string
}): Promise<string | null> {
	const current_count = db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count ?? 0

	const prior_count = await load_prior_snapshot_row_count({ key, date, table })
	if (prior_count === null) {
		log.info(`No prior snapshot found for ${key}; skipping row-count sanity check.`)
		return null
	}

	if (prior_count === 0) return null

	const change = (current_count - prior_count) / prior_count
	log.info(`${table} row count: ${current_count.toLocaleString()} (prior snapshot: ${prior_count.toLocaleString()}, ${change >= 0 ? '+' : ''}${(change * 100).toFixed(1)}%)`)

	if (change < -ROW_COUNT_DROP_THRESHOLD) {
		return `${table} row count dropped ${(change * -100).toFixed(1)}% vs the prior snapshot (${prior_count.toLocaleString()} -> ${current_count.toLocaleString()}) -- this usually means a source failed to load or was silently truncated.`
	}

	return null
}

async function load_prior_snapshot_row_count({ key, date, table }: {
	key: string
	date: string
	table: string
}): Promise<number | null> {
	const pattern = key === 'Ontology' ? 'Ontology_*_*.tabitha.sqlite.sql' : `${key}_*.tabitha.sqlite.sql`
	const files = Array.from(new Glob(pattern).scanSync('snapshots'))
		.filter(file => !file.includes(date)) // exclude the snapshot this run just wrote
		.sort() // lexicographical sort works for YYYY-MM-DD-stamped filenames

	const prior_file = files.pop()
	if (!prior_file) return null

	const temp_db_path = `raw/.validation-prior-${key}.sqlite`
	await cleanup()

	try {
		await $`cat snapshots/${prior_file} | sqlite3 ${temp_db_path}`.quiet()
		const temp_db = new Database(temp_db_path, { readonly: true })
		try {
			return temp_db.query<{ count: number }, []>(`SELECT COUNT(*) AS count FROM ${table}`).get()?.count ?? null
		} finally {
			// close(true), not close(): cleanup() below unlinks temp_db_path immediately, and a
			// deferred (sqlite3_close_v2) release would still be holding a Windows file lock by then.
			temp_db.close(true)
		}
	} finally {
		await cleanup()
	}

	async function cleanup() {
		if (existsSync(temp_db_path)) await unlink(temp_db_path)
	}
}
