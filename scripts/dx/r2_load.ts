import { copyFileSync, existsSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { $ } from 'bun'
import { Database } from 'bun:sqlite'
import { apps_config, parse_wrangler_jsonc } from './db_load'

type R2SeedEntry = {
	app: keyof typeof apps_config
	d1_binding: string
	r2_binding: string
	content_disposition?: string
}

// Add an entry here whenever an app's wrangler.jsonc gains an r2_buckets binding that local dev
// should have sample data for. Each entry seeds one R2 object from an already-loaded local D1
// database (see db_load.ts), matching the real shape production's backup job (see
// tools/databases/migrations/backup/index.ts) uploads: a `<database_name>.tabitha.sqlite` file.
const r2_seed_config: R2SeedEntry[] = [
	{
		app: 'ontology',
		d1_binding: 'DB_Ontology',
		r2_binding: 'R2_db_backups',
		content_disposition: 'attachment; filename="Ontology.sqlite"',
	},
]

export async function load_r2(target_app: string = 'all') {
	const entries = target_app === 'all' ? r2_seed_config : r2_seed_config.filter(e => e.app === target_app)
	if (entries.length === 0) {
		console.error(`❌ No R2 seed config for "${target_app}". Available: ${r2_seed_config.map(e => e.app).join(', ')}`)
		process.exit(1)
	}

	console.log(`\n🪣 [TaBiThA R2 Loader] Seeding local R2 bucket(s) for: ${entries.map(e => e.app).join(', ')}...\n`)

	let success_count = 0

	for (const entry of entries) {
		const config = apps_config[entry.app]
		const wrangler = parse_wrangler_jsonc(config.wrangler_path) as {
			d1_databases?: { binding?: string, database_name: string, database_id: string }[]
			r2_buckets?: { binding?: string, bucket_name: string }[]
		} | null

		const d1 = wrangler?.d1_databases?.find(d => d.binding === entry.d1_binding)
		const bucket = wrangler?.r2_buckets?.find(b => b.binding === entry.r2_binding)
		if (!d1 || !bucket) {
			console.error(`❌ Could not find "${entry.d1_binding}"/"${entry.r2_binding}" in ${config.wrangler_path}`)
			continue
		}

		const db_hash = createHash('sha256').update(d1.database_id).digest('hex')
		const local_d1_file = join(config.app_dir, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject', `${db_hash}.sqlite`)
		if (!existsSync(local_d1_file)) {
			console.error(`❌ No local D1 database found for "${d1.database_name}" -- run \`bun run db:load:${entry.app}\` first.`)
			continue
		}

		const object_key = get_backup_name(local_d1_file)
		console.log(`⏳ Seeding "${bucket.bucket_name}/${object_key}" for ${entry.app} from local "${d1.database_name}"...`)

		const staging_dir = mkdtempSync(join(tmpdir(), 'tabitha-r2-load-'))
		const staged_file = join(staging_dir, object_key)
		try {
			copyFileSync(local_d1_file, staged_file)

			// Bun's $ resolves a bare `wrangler` against the *script's* own node_modules/.bin, not
			// the app dir passed to .cwd() -- so the app's wrangler is invoked by its JS entrypoint
			// directly (via `bun`, not the node_modules/.bin shim) to also dodge the .bin shim's
			// .cmd/.ps1 split on Windows.
			const wrangler_entry = join(config.app_dir, 'node_modules/wrangler/bin/wrangler.js')
			const cd_args = entry.content_disposition ? ['--content-disposition', entry.content_disposition] : []
			await $`bun ${wrangler_entry} r2 object put ${bucket.bucket_name}/${object_key} --file ${staged_file} ${cd_args} --local`
				.cwd(config.app_dir)
				.quiet()

			console.log(`   ⚡ Seeded "${object_key}" into local "${bucket.bucket_name}"!\n`)
			success_count++
		} catch (err) {
			console.error(`   ❌ Failed to seed "${object_key}":`, err instanceof Error ? err.message : err)
		} finally {
			rmSync(staging_dir, { recursive: true, force: true })
		}
	}

	console.log(`🎉 Finished seeding ${success_count}/${entries.length} R2 bucket(s) into local Wrangler environment.\n`)

	if (success_count < entries.length) {
		console.error(`❌ Failed to seed all R2 buckets (${success_count}/${entries.length} succeeded).`)
		process.exit(1)
	}
}

function get_backup_name(db_file: string) {
	const db = new Database(db_file)
	const version = db.query<{ version: string }, []>('SELECT version FROM Version').get()?.version || ''
	db.close()
	return `Ontology_${version.replaceAll('.', '-')}.tabitha.sqlite`
}

if (import.meta.main) {
	const target = process.argv[2] || 'all'
	await load_r2(target)
}
