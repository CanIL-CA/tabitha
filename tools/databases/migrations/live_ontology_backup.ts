import { Database } from 'bun:sqlite'

const BACKUPS_ORIGIN = 'https://db-backups.tabitha.bible'

// Same key the nightly backup writes and TBTA's updater downloads: dots in the version become dashes.
export function backup_url({ version }: { version: string }): string {
	return `${BACKUPS_ORIGIN}/Ontology_${version.replaceAll('.', '-')}.tabitha.sqlite`
}

// TBTA stamps each language database with the Ontology version it was last mapped to, and tbta_utils
// only works against that exact Ontology: a newer one prints garbage and still exits 0.
export function read_ontology_version({ db_path }: { db_path: string }): string {
	const db = new Database(db_path, { readonly: true })
	try {
		const row = db.query<{ Version: string }, []>('SELECT Version FROM OntologyVersion').get()
		if (!row?.Version) throw new Error(`${db_path} has no OntologyVersion row, so the matching Ontology backup can't be chosen.`)
		return row.Version
	} finally {
		db.close()
	}
}

export async function download_ontology_backup({ version, dest }: { version: string, dest: string }): Promise<void> {
	const url = backup_url({ version })
	const response = await fetch(url)
	if (!response.ok) {
		throw new Error(`No live Ontology backup for ${version} (${response.status} from ${url}). The language database was mapped to an Ontology version whose backup is gone; ask for a re-export against the current Ontology.`)
	}
	await Bun.write(dest, response)
}
