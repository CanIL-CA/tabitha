import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { Database } from 'bun:sqlite'
import { strip_jsonc_comments } from '@tabitha/types/patterns'
import { read_pinned_snapshots } from './db_load'

const script_dir = dirname(fileURLToPath(import.meta.url))
const root_dir = resolve(script_dir, '../..')
const snapshots_dir = join(root_dir, 'tools', 'databases', 'snapshots')

type TableInfo = {
	name: string
	rows: number
}

type DbStatus = {
	app: string
	binding: string
	database_name: string
	database_id: string
	local_file: string | null
	file_size_bytes: number
	last_modified: Date | null
	tables: TableInfo[]
	snapshot_file: string | null
	snapshot_size_bytes: number
}

type D1Config = {
	binding: string
	database_name: string
	database_id: string
}

type WranglerD1Config = {
	d1_databases?: { binding?: string, database_name?: string, database_id?: string }[]
}

const APP_NAMES = ['ontology', 'sources', 'targets', 'editor', 'copilot', 'survey']

function parse_wrangler_d1_configs(app_name: string): D1Config[] {
	const wrangler_path = join(root_dir, 'apps', app_name, 'wrangler.jsonc')
	if (!existsSync(wrangler_path)) return []

	try {
		const raw = readFileSync(wrangler_path, 'utf-8')
		const cleaned = strip_jsonc_comments(raw)
		const config: WranglerD1Config = JSON.parse(cleaned)
		if (Array.isArray(config.d1_databases)) {
			return config.d1_databases.map(db => ({
				binding: db.binding || 'D1_DATABASE',
				database_name: db.database_name || 'unknown',
				database_id: db.database_id || 'unknown',
			}))
		}
	} catch {
		return []
	}
	return []
}

function format_bytes(bytes: number): string {
	if (bytes === 0) return '0 B'
	const k = 1024
	const sizes = ['B', 'KB', 'MB', 'GB']
	const i = Math.floor(Math.log(bytes) / Math.log(k))
	return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function find_sqlite_files(base_dir: string): string[] {
	if (!existsSync(base_dir)) return []
	const files: string[] = []
	try {
		const entries = readdirSync(base_dir, { withFileTypes: true, recursive: true })
		for (const entry of entries) {
			if (entry.isFile() && entry.name.endsWith('.sqlite') && !entry.name.includes('metadata')) {
				files.push(join(entry.parentPath || base_dir, entry.name))
			}
		}
	} catch {
		return []
	}
	return files
}

function find_snapshot_file({ db_name, binding }: {
	db_name: string
	binding: string
}): { path: string; size: number } | null {
	if (!existsSync(snapshots_dir)) return null
	try {
		const files = readdirSync(snapshots_dir)
		// 0. The pin db_load uses for a long-lived database (manifest.json's pinned_snapshots)
		const pinned = read_pinned_snapshots()[binding]
		if (pinned) {
			const full = join(snapshots_dir, pinned)
			return existsSync(full) ? { path: full, size: statSync(full).size } : null
		}

		// 1. Exact match (e.g. Targets_English_2026-07-31.tabitha.sqlite.sql)
		const exact = files.find(f => f.startsWith(`${db_name}.`) && (f.endsWith('.sql') || f.endsWith('.sqlite')))
		if (exact) {
			const full = join(snapshots_dir, exact)
			return { path: full, size: statSync(full).size }
		}

		// 2. Prefix match (e.g. Ontology_9494_ matching latest dump)
		const prefix = db_name.split('_')[0]
		const matching = files
			.filter(f => f.startsWith(prefix) && (f.endsWith('.sql') || f.endsWith('.sqlite')))
			.sort()

		if (matching.length > 0) {
			const full = join(snapshots_dir, matching[matching.length - 1])
			return { path: full, size: statSync(full).size }
		}
	} catch {
		return null
	}
	return null
}

export async function inspect_databases(): Promise<DbStatus[]> {
	const results: DbStatus[] = []

	for (const app_name of APP_NAMES) {
		const d1_configs = parse_wrangler_d1_configs(app_name)
		if (d1_configs.length === 0) continue

		const d1_dir = join(root_dir, 'apps', app_name, '.wrangler', 'state', 'v3', 'd1')
		const sqlite_files = find_sqlite_files(d1_dir)

		for (const d1 of d1_configs) {
			const snapshot = find_snapshot_file({ db_name: d1.database_name, binding: d1.binding })
			let matched_file: string | null = null
			let file_size = 0
			let last_mod: Date | null = null
			const tables: TableInfo[] = []

			const expected_hash = createHash('sha256').update(d1.database_id).digest('hex')
			const expected_file = join(d1_dir, 'miniflare-D1DatabaseObject', `${expected_hash}.sqlite`)
			const files_to_check = existsSync(expected_file)
				? [expected_file, ...sqlite_files.filter(f => f !== expected_file)]
				: sqlite_files

			for (const file_path of files_to_check) {
				try {
					const db = new Database(file_path)
					const table_names = (db.query("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(t => t.name)

					// Match database tables
					const is_auth = d1.binding.toLowerCase().includes('auth') || d1.database_name.toLowerCase().includes('auth')
					const is_auth_table = table_names.includes('Users') || table_names.includes('Permissions')

					if (is_auth && is_auth_table || !is_auth && !is_auth_table && table_names.some(t => !t.startsWith('_cf_'))) {
						matched_file = file_path
						const stat = statSync(file_path)
						file_size = stat.size
						last_mod = stat.mtime

						for (const tname of table_names) {
							if (tname.startsWith('_cf_') || tname.startsWith('sqlite_')) continue
							try {
								const count_res = db.query(`SELECT count(*) as count FROM "${tname}"`).get() as { count: number } | null
								tables.push({ name: tname, rows: count_res?.count ?? 0 })
							} catch {
								tables.push({ name: tname, rows: -1 })
							}
						}
						db.close(true)
						break
					}
					db.close(true)
				} catch {
					// Continue searching
				}
			}

			results.push({
				app: app_name,
				binding: d1.binding,
				database_name: d1.database_name,
				database_id: d1.database_id,
				local_file: matched_file,
				file_size_bytes: file_size,
				last_modified: last_mod,
				tables,
				snapshot_file: snapshot?.path ?? null,
				snapshot_size_bytes: snapshot?.size ?? 0,
			})
		}
	}

	return results
}

export async function print_database_status() {
	console.log(`
============================================================
           📊 TaBiThA Local D1 Database Inspector           
============================================================
`)

	const statuses = await inspect_databases()

	if (statuses.length === 0) {
		console.log('⚠️  No D1 database definitions found across apps/*/wrangler.jsonc\n')
		return
	}

	for (const s of statuses) {
		const is_ready = s.local_file !== null && s.tables.length > 0
		const status_badge = is_ready ? '🟢 READY' : '🔴 MISSING'

		console.log(`🗄️  [${s.binding}] ${s.database_name} (${status_badge})`)
		console.log(`   • App Target:      apps/${s.app}`)
		console.log(`   • D1 Database ID:  ${s.database_id}`)

		if (s.local_file) {
			const rel_path = relative(root_dir, s.local_file)
			const mod_time = s.last_modified ? s.last_modified.toLocaleString() : 'Unknown'
			console.log(`   • Local SQLite:    ${rel_path} (${format_bytes(s.file_size_bytes)}, modified ${mod_time})`)
			console.log('   • Tables & Row Counts:')

			const columns = 2
			for (let i = 0; i < s.tables.length; i += columns) {
				const chunk = s.tables.slice(i, i + columns)
				const formatted = chunk.map(t => `       ▪ ${t.name.padEnd(26)} ${t.rows.toLocaleString().padStart(8)} rows`).join('  |  ')
				console.log(formatted)
			}
		} else {
			console.log('   • Local SQLite:    ⚠️  No local database found in .wrangler state')
			console.log(`   • Action:          Run \`bun run db:load\` or \`bun run db:load:${s.app}\` to populate`)
		}

		if (s.snapshot_file) {
			const rel_snap = relative(root_dir, s.snapshot_file)
			console.log(`   • SQL Snapshot:    ${rel_snap} (${format_bytes(s.snapshot_size_bytes)})`)
		} else {
			console.log('   • SQL Snapshot:    ⚠️  No snapshot file found in tools/databases/snapshots/')
		}

		console.log('')
	}

	console.log('============================================================')
	console.log('💡 Quick Commands:')
	console.log('   • Reload all databases:       bun run db:load')
	console.log('   • Reload specific database:   bun run db:load:ontology | bun run db:load:sources | bun run db:load:targets | bun run db:load:survey')
	console.log('   • Health diagnostics:         bun run check:doctor')
	console.log('============================================================\n')
}

if (import.meta.main) {
	await print_database_status()
}
