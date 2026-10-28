import { $ } from 'bun'
import { execute_file, read_ontology_database_name } from './live'
import { create_logger } from '../log'

const log = create_logger('Refresh Previews Ontology')

const WORK_PATH = 'raw/.ontology-refresh-preview'

/**
 * Resets the Previews copy of DB_Ontology to production's data, keeping its name and id so no
 * binding changes: production is exported, every table in the Previews copy is dropped, and the
 * export is loaded in their place. Run it after applying a migration to production, or before
 * testing a write-heavy PR; it discards anything written on Previews since the last refresh.
 */
async function refresh_preview(): Promise<void> {
	const production_name = await read_ontology_database_name('production')
	const preview_name = await read_ontology_database_name('preview')
	if (production_name === preview_name) {
		throw new Error(`Production and Previews both bind "${production_name}"; refusing to drop its tables.`)
	}

	if (process.stdin.isTTY && !confirm(`Replace every table in ${preview_name} with ${production_name}'s data?`)) {
		log.step('Nothing changed.')
		return
	}

	const export_file = `${WORK_PATH}.sql`
	log.step(`Exporting ${production_name}...`)
	await $`bun wrangler d1 export ${production_name} --remote --output ${export_file}`

	const tables = await list_tables(preview_name)
	const drop_file = `${WORK_PATH}.drop.sql`
	await Bun.write(drop_file, drop_tables_sql(tables))
	log.step(`Dropping ${tables.length} table(s) in ${preview_name}...`)
	await execute_file({ database_name: preview_name, file: drop_file })

	log.step(`Loading ${production_name}'s export into ${preview_name}...`)
	await execute_file({ database_name: preview_name, file: export_file })
}

// D1 keeps its own bookkeeping in _cf_ tables, which can't be dropped.
async function list_tables(database_name: string): Promise<string[]> {
	const query = `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'`
	const [result] = await $`bun wrangler d1 execute ${database_name} --remote --json --command ${query}`.quiet().json() as [{ results: { name: string }[] }]
	return result.results.map(row => row.name)
}

export function drop_tables_sql(tables: string[]): string {
	return ['PRAGMA defer_foreign_keys = true;', ...tables.map(table => `DROP TABLE IF EXISTS "${table.replaceAll('"', '""')}";`)].join('\n')
}

if (import.meta.main) {
	await refresh_preview()
	log.summary()
}
