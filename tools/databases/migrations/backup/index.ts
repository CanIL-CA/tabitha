import { $ } from 'bun'
import { Database } from 'bun:sqlite'
import { join } from 'node:path'
import { create_logger } from '../log'
import { BUCKET, PUBLIC_BASE_URL } from '../r2_sync'
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
// Every version is kept: classic TBTA's updater downloads db-backups/Ontology_<version>.tabitha.sqlite
// by version, and its target upgrade asks for the exact older version a target was built against.
// content-disposition names a browser download "Ontology.sqlite", the file name the TBTA app loads
// (the link on /downloads is cross-origin, so this header controls the saved filename).
await $`wrangler r2 object put db-backups/${backup_name} --file ${db_from_dump.filename} --content-disposition 'attachment; filename="${DB_NAME}.sqlite"' --remote`

db_from_dump.close()

await upload_snapshot({ dump_filename, backup_name })

log.summary()

// Local dev and CI load a pinned version of this dump (manifest.json's pinned_snapshots). A version's
// snapshot is written once, like every other snapshot, so a pin always means the same data.
async function upload_snapshot({ dump_filename, backup_name }: {
	dump_filename: string
	backup_name: string
}) {
	const snapshot_name = `${backup_name}.sql`
	const existing = await fetch(`${PUBLIC_BASE_URL}/snapshots/${snapshot_name}`, { method: 'HEAD' })
	if (existing.ok) {
		log.step(`Snapshot ${snapshot_name} already exists; leaving it as is.`)
		return
	}

	log.step(`Uploading snapshot ${snapshot_name} to ${BUCKET}...`)
	await $`wrangler r2 object put ${BUCKET}/snapshots/${snapshot_name} --file ${dump_filename} --remote`
}

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
