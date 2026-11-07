import { $ } from 'bun'
import { existsSync, rmSync } from 'node:fs'
import { create_logger } from '../log'
import { PUBLIC_BASE_URL } from '../r2_sync'

const log = create_logger('Ontology Fixture')

const WORK_PATH = 'raw/.ontology-fixture'

// Concept details lists a concept's examples, filtered by source, so every concept keeps some of each source.
// The rest of the 677,839 rows are nearly all of the snapshot's size and no test reads them.
const EXAMPLES_PER_CONCEPT_AND_SOURCE = 10

/**
 * Derives the smaller Ontology snapshot that local dev and CI pin (manifest.json's pinned_snapshots)
 * from the nightly backup's full snapshot of the same version, keeping a sample of Exhaustive_Examples.
 * `Concepts.occurrences` keeps the full counts, so a concept can show more occurrences than examples.
 * Upload the result with `bun run r2:push snapshots`.
 */
async function build_fixture({ version }: {
	version: string
}): Promise<void> {
	const full_file = `${WORK_PATH}.full.sql`
	const work_database = `${WORK_PATH}.sqlite`
	const fixture_file = `snapshots/${fixture_filename({ version })}`

	if (!existsSync(full_file)) {
		const url = `${PUBLIC_BASE_URL}/snapshots/Ontology_${version}.tabitha.sqlite.sql`
		log.step(`Downloading ${url}...`)
		const response = await fetch(url)
		if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
		await Bun.write(full_file, await response.arrayBuffer())
	}

	rmSync(work_database, { force: true })
	log.step('Loading the full snapshot...')
	await $`sqlite3 ${work_database} < ${full_file}`

	log.step(`Keeping ${EXAMPLES_PER_CONCEPT_AND_SOURCE} examples per concept and source...`)
	await $`sqlite3 ${work_database} ${trim_examples_sql({ per_concept_and_source: EXAMPLES_PER_CONCEPT_AND_SOURCE })}`

	log.step(`Writing ${fixture_file}...`)
	const dump = await $`sqlite3 ${work_database} .dump`.text()
	await Bun.write(fixture_file, strip_transaction_statements({ dump }))

	rmSync(work_database, { force: true })
}

export function fixture_filename({ version }: {
	version: string
}): string {
	return `Ontology_${version}_fixture.tabitha.sqlite.sql`
}

export function trim_examples_sql({ per_concept_and_source }: {
	per_concept_and_source: number
}): string {
	return `
		DELETE FROM Exhaustive_Examples WHERE rowid NOT IN (
			SELECT rowid FROM (
				SELECT rowid, row_number() OVER (PARTITION BY concept_stem, concept_sense, concept_part_of_speech, ref_type ORDER BY rowid) AS position
				FROM Exhaustive_Examples
			) WHERE position <= ${per_concept_and_source}
		);
	`
}

// db_load wraps every snapshot in its own transaction, and SQLite refuses a nested BEGIN.
export function strip_transaction_statements({ dump }: {
	dump: string
}): string {
	return dump
		.split('\n')
		.filter(line => line !== 'BEGIN TRANSACTION;' && line !== 'COMMIT;')
		.join('\n')
}

if (import.meta.main) {
	const version = Bun.argv[2]
	if (!version) throw new Error('Usage: bun migrations/ontology/fixture.ts <version>, e.g. 3-0-9533')
	await build_fixture({ version })
	log.summary()
}
