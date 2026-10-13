// Deletes superseded D1 databases left behind by the migration pipeline's "mint a fresh dated
// database per run" convention (see docs/decisions/0012-per-project-targets-databases.md and the
// d1_databases comments in apps/{ontology,sources,targets}/wrangler.jsonc) -- every re-run creates
// a new live database and nothing ever deletes the one it replaced. Safe to delete: the archival
// copy is the SQL dump in the db-migration-data R2 bucket (tools/databases/snapshots/), not the
// live D1 database itself.
//
// Retention: for each dated family (name with a trailing _YYYY-MM-DD stripped, e.g. "Sources" or
// "Targets_English"), the currently-bound database is always kept, plus the single newest unbound
// generation as a live rollback copy. Everything older is deleted. Undated databases (e.g. "Auth")
// never match the family pattern and are always left alone.

import { $ } from 'bun'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { strip_jsonc_comments } from '@tabitha/types/patterns'
import { create_logger } from './log'

const log = create_logger('D1 Cleanup')
const dry_run = process.argv.includes('--dry-run')

const root_dir = join(import.meta.dir, '../../..')
const APPS_WITH_D1 = ['ontology', 'sources', 'targets']
const DATE_SUFFIX = /_\d{4}-\d{2}-\d{2}$/

type LiveDb = {
	uuid: string
	name: string
	created_at: string
}

function collect_bound_ids({ obj, ids }: {
	obj: unknown
	ids: Set<string>
}) {
	if (!obj || typeof obj !== 'object') return
	const record = obj as Record<string, unknown>
	if (Array.isArray(record.d1_databases)) {
		for (const entry of record.d1_databases) {
			const id = (entry as Record<string, unknown>)?.database_id
			if (typeof id === 'string') ids.add(id)
		}
	}
	for (const value of Object.values(record)) collect_bound_ids({ obj: value, ids })
}

function get_bound_database_ids(): Set<string> {
	const ids = new Set<string>()
	for (const app of APPS_WITH_D1) {
		const wrangler_path = join(root_dir, 'apps', app, 'wrangler.jsonc')
		if (!existsSync(wrangler_path)) continue
		const config = JSON.parse(strip_jsonc_comments(readFileSync(wrangler_path, 'utf-8')))
		collect_bound_ids({ obj: config, ids })
	}
	return ids
}

async function list_live_databases(): Promise<LiveDb[]> {
	const output = await $`wrangler d1 list --json`.text()
	return JSON.parse(output)
}

function family_of(name: string): string | null {
	return DATE_SUFFIX.test(name) ? name.replace(DATE_SUFFIX, '') : null
}

const bound_ids = get_bound_database_ids()
const live_dbs = await list_live_databases()

const candidates_by_family = new Map<string, LiveDb[]>()
for (const db of live_dbs) {
	if (bound_ids.has(db.uuid)) {
		log.info(`keep (bound): ${db.name}`)
		continue
	}
	const family = family_of(db.name)
	if (!family) {
		log.info(`keep (undated, not part of the migration pipeline): ${db.name}`)
		continue
	}
	const list = candidates_by_family.get(family) ?? []
	list.push(db)
	candidates_by_family.set(family, list)
}

let deleted_count = 0
for (const [family, dbs] of candidates_by_family) {
	const [rollback_copy, ...to_delete] = dbs.toSorted((a, b) => b.created_at.localeCompare(a.created_at))
	log.info(`keep (rollback copy, ${family}): ${rollback_copy.name}`)
	for (const db of to_delete) {
		if (dry_run) {
			log.step(`[dry run] Would delete ${db.name} (${db.uuid})`)
		} else {
			log.step(`Deleting ${db.name} (${db.uuid})...`)
			await $`wrangler d1 delete ${db.name} --skip-confirmation`
		}
		deleted_count++
	}
}

log.success(`${dry_run ? 'Would delete' : 'Deleted'} ${deleted_count} unused D1 database${deleted_count === 1 ? '' : 's'}.`)
log.summary()
