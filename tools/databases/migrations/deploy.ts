import { $ } from 'bun'
import { basename, join } from 'path'
import type { PlannedTask, TaskFamily } from './plan'
import { apply_status_to_d1 } from './sources/update_status'
import { create_logger } from './log'

const log = create_logger('Deploy')

const APP_BY_FAMILY: Record<TaskFamily, string> = {
	Sources: 'sources',
	Ontology: 'ontology',
	Targets: 'targets',
}

/**
 * Bindings that per-PR Worker Previews write to (ontology's suggest/approve flows), so Previews get
 * their own copy of each new database instead of sharing production's -- see
 * docs/decisions/0020-per-pr-worker-previews.md. Read-only bindings keep sharing production's.
 */
const PREVIEW_COPY_BINDINGS = new Set(['DB_Ontology'])

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
 * that wrangler.jsonc change is merged and deployed, so a run from a branch never touches it. For a
 * binding in PREVIEW_COPY_BINDINGS, a second database loaded from the same dump backs the `previews`
 * block, so testing a Preview never writes to the database that ships.
 */
export async function deploy_to_d1({ task, dump_file, date }: DeployOptions): Promise<void> {
	const database_name = basename(task.output_file, '.tabitha.sqlite') // => Sources_2025-10-22 or Ontology_9493_2025-10-22
	const binding = `DB_${task.id}`

	const database = await create_and_load({ database_name, dump_file })

	// A freshly-deployed Sources db doesn't carry status data (Sources migration only applies status
	// to the local build if a status CSV happened to be available at that time) -- reapply the latest
	// known status immediately so a new deploy never regresses to stale/no status.
	if (task.family === 'Sources') {
		await apply_status_to_d1({ d1_database_name: database_name, csv_dir: join(import.meta.dir, '../data/status'), date })
	}

	const preview_database = PREVIEW_COPY_BINDINGS.has(binding)
		? await create_and_load({ database_name: preview_database_name(database_name), dump_file })
		: undefined

	const config_path = join(import.meta.dir, '../../../apps', APP_BY_FAMILY[task.family], 'wrangler.jsonc')
	log.step(`Repointing ${binding} in ${config_path} at ${database_name}${preview_database ? ` (Previews: ${preview_database.name})` : ''}...`)
	const config_text = await Bun.file(config_path).text()
	await Bun.write(config_path, repoint_d1_binding({ config_text, binding, database, preview_database }))
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

/**
 * Names a Previews copy so its date stays the trailing suffix (Ontology_9494_preview_2026-09-29),
 * which makes it its own dated family in cleanup_unused_d1.ts and subject to the same retention.
 */
export function preview_database_name(database_name: string): string {
	const dated = database_name.match(/^(.*)(_\d{4}-\d{2}-\d{2})$/)
	if (!dated) throw new Error(`Expected a date-stamped database name, got "${database_name}".`)
	return `${dated[1]}_preview${dated[2]}`
}

async function find_d1_database(name: string): Promise<D1Database | undefined> {
	const databases = await $`bun wrangler d1 list --json`.quiet().json() as D1Database[]
	return databases.find(database => database.name === name)
}

type RepointOptions = {
	readonly config_text: string
	readonly binding: string
	readonly database: D1Database
	/** Where the `previews` block's entry should point instead; defaults to `database`. */
	readonly preview_database?: D1Database
}

/**
 * Points every d1_databases entry for `binding` at a new database: top-level entries at `database`,
 * and the `previews` block's entry at `preview_database` when one is given. Rewrites the raw text
 * rather than parsing, so wrangler.jsonc's comments survive.
 */
export function repoint_d1_binding({ config_text, binding, database, preview_database = database }: RepointOptions): string {
	const binding_entry = new RegExp(`("binding":\\s*"${binding}",\\s*"database_name":\\s*)"[^"]*"(,\\s*"database_id":\\s*)"[^"]*"`, 'g')
	const repoint = ({ text, target }: {
		text: string
		target: D1Database
	}) =>
		text.replace(binding_entry, (_match, name_prefix: string, id_prefix: string) => `${name_prefix}"${target.name}"${id_prefix}"${target.uuid}"`)

	if (!config_text.match(binding_entry)) {
		throw new Error(`No d1_databases entry with binding "${binding}" (followed by database_name, database_id) found in wrangler config.`)
	}

	const previews = find_previews_block(config_text)
	if (!previews) return repoint({ text: config_text, target: database })

	const block = config_text.slice(previews.start, previews.end)
	if (preview_database !== database && !block.match(binding_entry)) {
		throw new Error(`The previews block has no d1_databases entry with binding "${binding}" to point at "${preview_database.name}".`)
	}

	return repoint({ text: config_text.slice(0, previews.start), target: database })
		+ repoint({ text: block, target: preview_database })
		+ repoint({ text: config_text.slice(previews.end), target: database })
}

/** Finds the `"previews": { ... }` object's span by brace matching, skipping strings and comments. */
function find_previews_block(config_text: string): { start: number; end: number } | undefined {
	const key = config_text.match(/"previews"\s*:\s*\{/)
	if (key?.index === undefined) return undefined

	const start = key.index
	let depth = 0
	for (let i = start + key[0].length - 1; i < config_text.length; i++) {
		const char = config_text[i]
		if (char === '"') {
			i = skip_string({ text: config_text, open: i })
		} else if (char === '/' && config_text[i + 1] === '/') {
			const newline = config_text.indexOf('\n', i)
			i = newline === -1 ? config_text.length : newline
		} else if (char === '{') {
			depth++
		} else if (char === '}' && --depth === 0) {
			return { start, end: i + 1 }
		}
	}
	throw new Error('Unbalanced braces in the wrangler config\'s "previews" block.')
}

/** Returns the index of the closing quote of the string starting at `open`. */
function skip_string({ text, open }: {
	text: string
	open: number
}): number {
	for (let i = open + 1; i < text.length; i++) {
		if (text[i] === '\\') i++
		else if (text[i] === '"') return i
	}
	return text.length
}
