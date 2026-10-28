import { $ } from 'bun'
import { basename, join } from 'path'
import type { PlannedTask, TaskFamily } from './plan'
import { apply_status_to_d1 } from './sources/update_status'
import { create_logger } from './log'

const log = create_logger('Deploy')

const APP_BY_FAMILY: Record<TaskFamily, string> = {
	Sources: 'sources',
	Targets: 'targets',
}

/**
 * Families whose apps only read, so D1 read replicas near each visitor can't show anyone a stale
 * view of their own write. By family rather than binding, so a new target language is covered
 * without being listed here. A new database starts with replication disabled, so every deploy has
 * to turn it on.
 * https://developers.cloudflare.com/d1/best-practices/read-replication/
 */
const READ_REPLICATED_FAMILIES = new Set<TaskFamily>(['Sources', 'Targets'])

type D1Database = {
	readonly uuid: string
	readonly name: string
}

type DeployOptions = {
	readonly task: PlannedTask
	readonly dump_file: string
	readonly date: string
}

/**
 * Creates a brand-new, date-stamped D1 database for a migrated task, loads its dump, and repoints
 * the owning app's wrangler.jsonc binding at it. Production keeps reading the old database until
 * that wrangler.jsonc change is merged and deployed, so a run from a branch never touches it.
 */
export async function deploy_to_d1({ task, dump_file, date }: DeployOptions): Promise<void> {
	const database_name = basename(task.output_file, '.tabitha.sqlite') // => Sources_2025-10-22
	const binding = `DB_${task.id}`

	const database = await create_and_load({ database_name, dump_file })

	// A freshly-deployed Sources db doesn't carry status data (Sources migration only applies status
	// to the local build if a status CSV happened to be available at that time) -- reapply the latest
	// known status immediately so a new deploy never regresses to stale/no status.
	if (task.family === 'Sources') {
		await apply_status_to_d1({ d1_database_name: database_name, csv_dir: join(import.meta.dir, '../data/status'), date })
	}

	if (READ_REPLICATED_FAMILIES.has(task.family)) {
		await enable_read_replication(database)
	}

	const config_path = join(import.meta.dir, '../../../apps', APP_BY_FAMILY[task.family], 'wrangler.jsonc')
	log.step(`Repointing ${binding} in ${config_path} at ${database_name}...`)
	const config_text = await Bun.file(config_path).text()
	await Bun.write(config_path, repoint_d1_binding({ config_text, binding, database }))
}

async function create_and_load({ database_name, dump_file }: {
	database_name: string
	dump_file: string
}): Promise<D1Database> {
	if (await find_d1_database(database_name)) {
		throw new Error(`D1 database "${database_name}" already exists but this run never finished loading it. Inspect it, then delete it (bun wrangler d1 delete ${database_name}) and re-run to deploy fresh.`)
	}

	log.step(`Creating D1 database ${database_name}...`)
	await $`bun wrangler d1 create ${database_name}`.quiet()

	const database = await find_d1_database(database_name)
	if (!database) {
		throw new Error(`D1 database "${database_name}" was not listed after creating it.`)
	}

	log.step(`Loading ${dump_file} into ${database_name}...`)
	await $`bun wrangler d1 execute ${database_name} --file ${dump_file} --remote --yes`.quiet()
	return database
}

type CloudflareResponse = {
	success: boolean
	errors: { message: string }[]
}

/**
 * wrangler has no command for this setting, so it goes through the REST API, with whichever token
 * wrangler itself is using (`wrangler login` or CLOUDFLARE_API_TOKEN).
 */
async function enable_read_replication(database: D1Database): Promise<void> {
	const { CLOUDFLARE_ACCOUNT_ID } = process.env
	if (!CLOUDFLARE_ACCOUNT_ID) {
		throw new Error('CLOUDFLARE_ACCOUNT_ID must be set (tools/databases/.env) to enable D1 read replication.')
	}

	log.step(`Enabling read replication on ${database.name}...`)
	const { token } = await $`bun wrangler auth token --json`.quiet().json() as { token: string }
	const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/d1/database/${database.uuid}`, {
		method: 'PUT',
		headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
		body: JSON.stringify({ read_replication: { mode: 'auto' } }),
	})
	const body = await response.json() as CloudflareResponse
	if (!body.success) {
		throw new Error(`Enabling read replication on ${database.name} failed: ${body.errors.map(error => error.message).join('; ')}`)
	}
}

async function find_d1_database(name: string): Promise<D1Database | undefined> {
	const databases = await $`bun wrangler d1 list --json`.quiet().json() as D1Database[]
	return databases.find(database => database.name === name)
}

type RepointOptions = {
	readonly config_text: string
	readonly binding: string
	readonly database: D1Database
}

/**
 * Points every d1_databases entry for `binding` at a new database, the `previews` block's included:
 * Previews of a read-only app share production's databases. Rewrites the raw text rather than
 * parsing, so wrangler.jsonc's comments survive.
 */
export function repoint_d1_binding({ config_text, binding, database }: RepointOptions): string {
	const binding_entry = new RegExp(`("binding":\\s*"${binding}",\\s*"database_name":\\s*)"[^"]*"(,\\s*"database_id":\\s*)"[^"]*"`, 'g')

	if (!config_text.match(binding_entry)) {
		throw new Error(`No d1_databases entry with binding "${binding}" (followed by database_name, database_id) found in wrangler config.`)
	}

	return config_text.replace(binding_entry, (_match, name_prefix: string, id_prefix: string) => `${name_prefix}"${database.name}"${id_prefix}"${database.uuid}"`)
}
