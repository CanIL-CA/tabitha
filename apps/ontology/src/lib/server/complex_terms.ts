import type { D1DatabaseSession } from '@cloudflare/workers-types'
import { CREATE_COMPLEX_TERMS_TABLE_SQL, INSERT_COMPLEX_TERMS_SQL, fetch_complex_terms } from '@tabitha/complex-terms'

export async function sync_complex_terms(db: D1DatabaseSession): Promise<number> {
	console.info('fetching latest complex terms spreadsheet data')
	const terms = await fetch_complex_terms()
	console.info(`received ${terms.length} rows from spreadsheet`)

	if (terms.length < 1) {
		console.info('No rows extracted from spreadsheet.')
		return 0
	}

	// Ensure table exists
	await db.prepare(CREATE_COMPLEX_TERMS_TABLE_SQL).run()

	const clear_stmt = db.prepare('DELETE FROM Complex_Terms')
	const insert_stmt = db.prepare(INSERT_COMPLEX_TERMS_SQL)
	const insert_stmts = terms.map(
		({ stem, sense, part_of_speech, structure, pairing, explication, ontology_status, level, notes }) =>
			insert_stmt.bind(stem, sense, part_of_speech, structure, pairing, explication, ontology_status, level, notes),
	)

	console.info(`Updating Complex_Terms table with ${terms.length} terms...`)

	await db.batch([clear_stmt, ...insert_stmts])

	const count = await db.prepare('SELECT COUNT(*) AS count FROM Complex_Terms').first<number>('count')
	const total_terms = count ?? terms.length

	console.info(`Successfully updated ${total_terms} complex terms in D1 database.`)
	return total_terms
}
