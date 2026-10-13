import Database from 'bun:sqlite'
import { load_examples } from './exhaustive_examples/load'
import { create_changes_table } from './changes'
import { load_complex_terms } from './complex_terms'
import { create_logger } from '../log'

const log = create_logger('Ontology migration')

// usage: `bun ontology/migrate.ts raw/Sources_YYYY-MM-DD.tabitha.sqlite raw/Sources_Complex_YYYY-MM-DD.tabitha.sqlite raw/Ontology_VERSION_YYYY-MM-DD.tabitha.sqlite`
const USAGE = 'Usage: bun ontology/migrate.ts raw/Sources_YYYY-MM-DD.tabitha.sqlite raw/Sources_Complex_YYYY-MM-DD.tabitha.sqlite raw/Ontology_VERSION_YYYY-MM-DD.tabitha.sqlite'
if (Bun.argv.length !== 5) {
	throw new Error(USAGE)
}

const sources_db_name = Bun.argv[2]	// raw/Sources_YYYY-MM-DD.tabitha.sqlite
const sources_db_complex_name = Bun.argv[3]	// raw/Sources_Complex_YYYY-MM-DD.tabitha.sqlite -- resolved by the planner, may be an older date than sources_db_name
const tabitha_db_name = Bun.argv[4]	// raw/Ontology_VERSION_YYYY-MM-DD.tabitha.sqlite
if (!sources_db_name || !sources_db_complex_name || !tabitha_db_name) {
	throw new Error(USAGE)
}

const tabitha_db = new Database(tabitha_db_name, { create: false, readwrite: true })

// drastic perf improvement: https://www.sqlite.org/pragma.html#pragma_journal_mode
tabitha_db.run('PRAGMA journal_mode = WAL')

normalize_concept_text_columns(tabitha_db)

await load_complex_terms(tabitha_db)

create_changes_table(tabitha_db)

log.step(`Opening Sources database: ${sources_db_name}`)
const sources_db = new Database(sources_db_name, { readwrite: true, create: false })

log.step(`Opening Sources_Complex database: ${sources_db_complex_name}`)
const sources_db_complex = new Database(sources_db_complex_name, { readwrite: true, create: false })

await load_examples({ db_ontology: tabitha_db, db_sources: sources_db, db_sources_complex: sources_db_complex })

create_indexes(tabitha_db)

log.step(`Optimizing ${tabitha_db_name}...`)
tabitha_db.run('VACUUM')
tabitha_db.close()

log.summary()

// The app treats these as always-present strings ("" when empty), but newly-added concepts in a
// TBTA export can carry NULLs (31 did in 2026-09-29), which breaks search on those rows.
function normalize_concept_text_columns(tabitha_db: Database) {
	log.step('Normalizing NULL concept text columns to empty strings...')
	const { changes } = tabitha_db.run(`
		UPDATE Concepts SET
			gloss = COALESCE(gloss, ''),
			brief_gloss = COALESCE(brief_gloss, ''),
			categorization = COALESCE(categorization, ''),
			curated_examples = COALESCE(curated_examples, '')
		WHERE gloss IS NULL OR brief_gloss IS NULL OR categorization IS NULL OR curated_examples IS NULL
	`)
	log.info(`${changes} concept(s) normalized`)
}

// NOCASE so the `stem LIKE ?` lookups can use the index (https://www.sqlite.org/optoverview.html#the_like_optimization)
function create_indexes(tabitha_db: Database) {
	log.step('Creating indexes...')
	tabitha_db.run('CREATE INDEX IF NOT EXISTS idx_concepts_stem ON Concepts (stem COLLATE NOCASE)')
	tabitha_db.run('CREATE INDEX IF NOT EXISTS idx_complex_terms_stem ON Complex_Terms (stem COLLATE NOCASE)')
	tabitha_db.run('CREATE INDEX IF NOT EXISTS idx_exhaustive_examples_concept ON Exhaustive_Examples (concept_stem, concept_sense, concept_part_of_speech)')
}

