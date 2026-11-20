import { Database } from 'bun:sqlite'

/**
 * Adds one blank row past the end of each `*_Mappings_<language>` table. A mapping row's ID is its
 * concept's position within its part of speech, and TBTA's engine reads one row past the last
 * concept of a part of speech, so a table sized to exactly the Ontology's concept count fails any
 * verse using that last concept with "Unknown error" (Romans 10:2 with zealousA, English 2026-11-19).
 * Older exports carried hundreds of spare blank rows, which hid this.
 */
export function pad_mapping_tables({ db_path }: { db_path: string }): string[] {
	const db = new Database(db_path)
	try {
		const tables = db.query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE '%\\_Mappings\\_%' ESCAPE '\\'").all().map(row => row.name)
		for (const table of tables) {
			const columns = db.query<{ name: string, type: string }, []>(`PRAGMA table_info([${table}])`).all().filter(column => column.name !== 'ID')
			const names = columns.map(column => `[${column.name}]`).join(', ')
			const blanks = columns.map(column => is_numeric(column.type) ? '0' : "''").join(', ')
			db.run(`INSERT INTO [${table}] (ID, ${names}) SELECT COALESCE(MAX(ID), 0) + 1, ${blanks} FROM [${table}]`)
		}
		return tables
	} finally {
		db.close()
	}
}

function is_numeric(type: string): boolean {
	return /INT|REAL|NUM|BOOL|FLOAT|DOUBLE/i.test(type)
}
