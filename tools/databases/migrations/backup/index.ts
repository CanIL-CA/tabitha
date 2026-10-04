import { $ } from 'bun'
import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { create_logger } from '../log'
import { select_backup_database, type ListedDatabase } from './select_database'

const log = create_logger('DB Backup')

const DB_NAME = 'Ontology'

// the database production binds (see select_database.ts for why not the newest one)
const db_name = await get_production_database_name()

// get dump (https://developers.cloudflare.com/workers/wrangler/commands/#d1-export)
const dump_filename = `${db_name}.tabitha.sql`
await $`wrangler d1 export ${db_name} --output ${dump_filename} --remote`

log.step('Creating db from dump...')
const db_from_dump = await create_db(dump_filename)

const backup_name = get_backup_name(db_from_dump)

log.step(`Uploading ${db_from_dump.filename} to R2...`)
// content-disposition filename ends in ".new" so that a downloaded backup, dropped into the legacy
// TBTA app's directory, triggers that app's upgrade cycle (see downloads/+page.svelte for the
// download-side half of this: the link is cross-origin, so this header controls the saved filename)
await $`wrangler r2 object put db-backups/${backup_name} --file ${db_from_dump.filename} --content-disposition 'attachment; filename="${DB_NAME}.new"' --remote`

db_from_dump.close()

log.summary()

async function get_production_database_name(): Promise<string> {
	const config_text = await Bun.file(join(import.meta.dir, '../../../../apps/ontology/wrangler.jsonc')).text()
	const databases = await $`wrangler d1 list --json`.quiet().json() as ListedDatabase[]

	return select_backup_database({ config_text, binding: `DB_${DB_NAME}`, databases })
}

// create db from dump (https://bun.com/docs/api/sqlite)
async function create_db(sql_filename: string): Promise<Database> {
	const db = new Database(sql_filename.replace('.sql', '.sqlite'))

	const sql = await Bun.file(sql_filename).text()
	const statements = sql.split(/;$/gm).filter(s => s.trim() !== '') // "sql-stmt-list" https://www.sqlite.org/lang.html

	log.step(`Running ${statements.length} statements in ${db.filename}`)

	db.run('PRAGMA journal_mode = WAL;')
	db.run('BEGIN TRANSACTION;')
	for (const statement of statements) {
		db.run(statement)
	}
	db.run('COMMIT;')

	return db
}

function get_backup_name(db: Database) {
	const version = db.query<{ version: string }, []>('SELECT version FROM Version').get()?.version || ''
	return `Ontology_${version.replaceAll('.', '-')}.tabitha.sqlite`
}
