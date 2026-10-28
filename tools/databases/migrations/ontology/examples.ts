import { $ } from 'bun'
import Database from 'bun:sqlite'
import { load_examples, UPDATE_OCCURRENCES_SQL } from './exhaustive_examples/load'
import { execute_file, export_to_sqlite, parse_target, read_ontology_database_name, to_d1_importable, type OntologyTarget } from './live'
import { create_logger } from '../log'

const log = create_logger('Ontology examples')

const USAGE = 'Usage: bun ontology/examples.ts <production|preview> raw/Sources_YYYY-MM-DD.tabitha.sqlite raw/Sources_Complex_YYYY-MM-DD.tabitha.sqlite'

// A rebuild that loses more than this share of the live examples usually means Sources failed to load.
const MAX_EXAMPLES_DROP = 0.2

const EXAMPLES_INDEX = 'idx_exhaustive_examples_concept'

// Dropping the old table in the same file that renames the new one keeps the gap without examples
// to one small statement batch, rather than the length of the ~90 MB load before it.
export const SWAP_SQL = `
DROP TABLE Exhaustive_Examples;
ALTER TABLE Exhaustive_Examples_next RENAME TO Exhaustive_Examples;
CREATE INDEX ${EXAMPLES_INDEX} ON Exhaustive_Examples (concept_stem, concept_sense, concept_part_of_speech);
UPDATE Concepts SET occurrences = 0;
${UPDATE_OCCURRENCES_SQL.trim()};
`

/**
 * Rebuilds Exhaustive_Examples and Concepts.occurrences in the live Ontology D1 from a new Sources
 * build. The examples are built locally against an export of the target database, loaded beside the
 * live table, then swapped in. occurrences is recounted on the live database itself, so concepts
 * created since the export are counted too.
 */
export async function rebuild_examples({ target, sources_file, sources_complex_file }: {
	target: OntologyTarget
	sources_file: string
	sources_complex_file: string
}): Promise<void> {
	const database_name = await read_ontology_database_name(target)
	const work_path = `raw/.ontology-examples-${target}`
	const sqlite_path = `${work_path}.sqlite`

	log.step(`Exporting ${database_name} (${target})...`)
	await export_to_sqlite({ database_name, sql_path: `${work_path}.sql`, sqlite_path })

	const db_ontology = new Database(sqlite_path, { readwrite: true, create: false })
	const live_count = count_examples(db_ontology)

	const db_sources = new Database(sources_file, { readonly: true })
	const db_sources_complex = new Database(sources_complex_file, { readonly: true })
	await load_examples({ db_ontology, db_sources, db_sources_complex })
	db_sources.close(true)
	db_sources_complex.close(true)

	const rebuilt_count = count_examples(db_ontology)
	const problem = examples_drop_problem({ live_count, rebuilt_count })
	if (problem) {
		db_ontology.close(true)
		throw new Error(`${problem} Nothing was written to ${database_name}.`)
	}

	// Renamed locally so the dump creates and fills Exhaustive_Examples_next; the index is dropped
	// first so its name stays free for the swap to recreate on the renamed table.
	db_ontology.run(`DROP INDEX IF EXISTS ${EXAMPLES_INDEX}`)
	db_ontology.run('ALTER TABLE Exhaustive_Examples RENAME TO Exhaustive_Examples_next')
	db_ontology.close(true)

	const dump = await $`sqlite3 --escape off ${sqlite_path} ${'.dump Exhaustive_Examples_next'}`.text()
	const load_file = `${work_path}.load.sql`
	const swap_file = `${work_path}.swap.sql`
	await Bun.write(load_file, `DROP TABLE IF EXISTS Exhaustive_Examples_next;\n${to_d1_importable(dump)}`)
	await Bun.write(swap_file, SWAP_SQL)

	log.step(`Loading ${rebuilt_count.toLocaleString()} examples (live: ${live_count.toLocaleString()}) into Exhaustive_Examples_next on ${database_name}...`)
	await execute_file({ database_name, file: load_file })

	log.step(`Swapping the new examples into ${database_name} and recounting occurrences...`)
	await execute_file({ database_name, file: swap_file })
}

export function examples_drop_problem({ live_count, rebuilt_count }: {
	live_count: number
	rebuilt_count: number
}): string | null {
	if (rebuilt_count === 0) return 'The rebuild produced no examples.'
	if (live_count === 0) return null

	const drop = (live_count - rebuilt_count) / live_count
	if (drop <= MAX_EXAMPLES_DROP) return null
	return `The rebuild has ${(drop * 100).toFixed(1)}% fewer examples than the live database (${live_count.toLocaleString()} -> ${rebuilt_count.toLocaleString()}).`
}

function count_examples(db: Database): number {
	return db.query<{ count: number }, []>('SELECT COUNT(*) AS count FROM Exhaustive_Examples').get()?.count ?? 0
}

if (import.meta.main) {
	const [target_arg, sources_file, sources_complex_file] = Bun.argv.slice(2)
	if (!sources_file || !sources_complex_file) throw new Error(USAGE)

	await rebuild_examples({ target: parse_target(target_arg), sources_file, sources_complex_file })
	log.summary()
}
