import { existsSync } from 'node:fs'
import { create_logger } from '../log'
import { PUBLIC_BASE_URL } from '../r2_sync'

const log = create_logger('Ontology Fixture')

const WORK_PATH = 'raw/.ontology-fixture.full.sql'

// Concept details lists a concept's examples, filtered by source, so every concept keeps some of each source.
// The rest of the 677,839 rows are nearly all of the snapshot's size and no test reads them.
const EXAMPLES_PER_CONCEPT_AND_SOURCE = 10

/**
 * Derives the smaller Ontology snapshot that local dev and CI pin (manifest.json's pinned_snapshots)
 * from the nightly backup's full snapshot of the same version, keeping a sample of Exhaustive_Examples.
 * `Concepts.occurrences` keeps the full counts, so a concept can show more occurrences than examples.
 * Upload the result with `wrangler r2 object put`; `r2:push` skips a file the manifest already lists.
 */
async function build_fixture({ version }: {
	version: string
}): Promise<void> {
	const fixture_file = `snapshots/${fixture_filename({ version })}`

	if (!existsSync(WORK_PATH)) {
		const url = `${PUBLIC_BASE_URL}/snapshots/Ontology_${version}.tabitha.sqlite.sql`
		log.step(`Downloading ${url}...`)
		const response = await fetch(url)
		if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
		await Bun.write(WORK_PATH, await response.arrayBuffer())
	}

	log.step(`Keeping ${EXAMPLES_PER_CONCEPT_AND_SOURCE} examples per concept and source...`)
	const full_sql = await Bun.file(WORK_PATH).text()
	await Bun.write(fixture_file, trim_examples({ sql: full_sql, per_concept_and_source: EXAMPLES_PER_CONCEPT_AND_SOURCE }))
	log.step(`Wrote ${fixture_file}`)
}

export function fixture_filename({ version }: {
	version: string
}): string {
	return `Ontology_${version}_fixture.tabitha.sqlite.sql`
}

const EXAMPLE_INSERT_PREFIX = 'INSERT INTO "Exhaustive_Examples" '

// A D1 export writes one INSERT per line (newlines inside text are char(10) calls), starting with the
// columns concept_stem, concept_sense, concept_part_of_speech and ref_type as quoted strings.
const EXAMPLE_KEY = /VALUES\(('(?:[^']|'')*','(?:[^']|'')*','(?:[^']|'')*','(?:[^']|'')*'),/

/**
 * Drops every Exhaustive_Examples row past the first `per_concept_and_source` of its concept and
 * source, in file order, and leaves every other line of the export as it is. Working on the export's
 * own text keeps the fixture in the format every SQLite version can load: `sqlite3 .dump` writes
 * `unistr()` for control characters, which CI's older sqlite3 doesn't have.
 */
export function trim_examples({ sql, per_concept_and_source }: {
	sql: string
	per_concept_and_source: number
}): string {
	const kept_per_key = new Map<string, number>()

	return sql
		.split('\n')
		.filter(line => {
			if (!line.startsWith(EXAMPLE_INSERT_PREFIX)) return true

			const key = line.match(EXAMPLE_KEY)?.[1]
			if (key === undefined) throw new Error(`Unrecognized Exhaustive_Examples row: ${line.slice(0, 200)}`)

			const kept = kept_per_key.get(key) ?? 0
			kept_per_key.set(key, kept + 1)
			return kept < per_concept_and_source
		})
		.join('\n')
}

if (import.meta.main) {
	const version = Bun.argv[2]
	if (!version) throw new Error('Usage: bun migrations/ontology/fixture.ts <version>, e.g. 3-0-9533')
	await build_fixture({ version })
	log.summary()
}
