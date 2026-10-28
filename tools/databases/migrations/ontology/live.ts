import { $ } from 'bun'
import { existsSync } from 'fs'
import { unlink } from 'fs/promises'
import { join } from 'path'
import { strip_jsonc_comments } from '@tabitha/types/patterns'

/**
 * The live Ontology D1 is the single source of truth (docs/decisions/0025-ontology-d1-single-source-of-truth.md):
 * production's database, plus the copy per-PR Previews write to.
 */
export type OntologyTarget = 'production' | 'preview'

export const ONTOLOGY_TARGETS: readonly OntologyTarget[] = ['production', 'preview']

const BINDING = 'DB_Ontology'
const CONFIG_PATH = join(import.meta.dir, '../../../../apps/ontology/wrangler.jsonc')

type D1Entry = { binding: string, database_name: string }
type OntologyConfig = { d1_databases?: D1Entry[], previews?: { d1_databases?: D1Entry[] } }

const ENTRIES_BY_TARGET: Record<OntologyTarget, (config: OntologyConfig) => D1Entry[] | undefined> = {
	production: config => config.d1_databases,
	preview: config => config.previews?.d1_databases,
}

/** The D1 database name `target` binds as DB_Ontology in apps/ontology/wrangler.jsonc. */
export function ontology_database_name({ config_text, target }: {
	config_text: string
	target: OntologyTarget
}): string {
	const config = JSON.parse(strip_jsonc_comments(config_text)) as OntologyConfig
	const name = ENTRIES_BY_TARGET[target](config)?.find(entry => entry.binding === BINDING)?.database_name
	if (!name) throw new Error(`No ${target} d1_databases entry with binding "${BINDING}" in the ontology wrangler config.`)
	return name
}

export function parse_target(arg: string | undefined): OntologyTarget {
	const target = ONTOLOGY_TARGETS.find(candidate => candidate === arg)
	if (!target) throw new Error(`Expected a target of ${ONTOLOGY_TARGETS.join(' or ')}, got "${arg ?? ''}".`)
	return target
}

export async function read_ontology_database_name(target: OntologyTarget): Promise<string> {
	return ontology_database_name({ config_text: await Bun.file(CONFIG_PATH).text(), target })
}

/** Exports a remote D1 database to `sql_path`, then builds `sqlite_path` from that dump. */
export async function export_to_sqlite({ database_name, sql_path, sqlite_path }: {
	database_name: string
	sql_path: string
	sqlite_path: string
}): Promise<void> {
	await $`bun wrangler d1 export ${database_name} --remote --output ${sql_path}`
	for (const path of [sqlite_path, `${sqlite_path}-wal`, `${sqlite_path}-shm`]) {
		if (existsSync(path)) await unlink(path)
	}
	await $`cat ${sql_path} | sqlite3 ${sqlite_path}`.quiet()
}

/**
 * Turns a `sqlite3 .dump` into something `wrangler d1 execute --file` accepts: D1 rejects
 * BEGIN TRANSACTION/COMMIT and most PRAGMAs in an import.
 * https://developers.cloudflare.com/d1/best-practices/import-export-data/
 */
export function to_d1_importable(dump: string): string {
	return dump
		.split('\n')
		.filter(line => !/^(PRAGMA|BEGIN TRANSACTION|COMMIT)/.test(line))
		.join('\n')
}

export async function execute_file({ database_name, file }: {
	database_name: string
	file: string
}): Promise<void> {
	await $`bun wrangler d1 execute ${database_name} --file ${file} --remote --yes`
}
