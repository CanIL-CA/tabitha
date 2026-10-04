import { strip_jsonc_comments } from '@tabitha/types/patterns'

export type ListedDatabase = {
	readonly name: string
}

type SelectOptions = {
	/** The app's wrangler.jsonc, as checked out from main. */
	readonly config_text: string
	readonly binding: string
	readonly databases: readonly ListedDatabase[]
}

/**
 * Picks which D1 database the nightly backup exports: the one production binds, read from the top
 * level of the app's wrangler.jsonc. Not "the newest database with this name prefix": that would
 * also match the Previews copy (Ontology_<n>_preview_<date>, created right after production's) and
 * a newer database a data-update PR created on its branch before merging.
 */
export function select_backup_database({ config_text, binding, databases }: SelectOptions): string {
	const config = JSON.parse(strip_jsonc_comments(config_text)) as { d1_databases?: { binding: string; database_name: string }[] }
	const name = config.d1_databases?.find(entry => entry.binding === binding)?.database_name
	if (!name) throw new Error(`No top-level d1_databases entry with binding "${binding}" in wrangler config.`)
	if (!databases.some(db => db.name === name)) throw new Error(`Production's ${binding} database "${name}" isn't in this account's D1 databases.`)
	return name
}
