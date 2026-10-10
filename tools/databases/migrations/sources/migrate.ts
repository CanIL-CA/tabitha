import Database from 'bun:sqlite'
import { migrate_source_features } from './migrate_source_features'
import { migrate_source_texts } from './migrate_source_texts'
import { basename, join } from 'path'
import { migrate_source_status } from './migrate_source_status'
import { bun_sqlite_runner } from './sql_runner'
import { resolve_dated_file } from '../resolve_dated_file'
import { create_logger } from '../log'

const log = create_logger('Sources migration')

// usage: `bun sources/migrate.ts raw/Bible_YYYY-MM-DD.tbta.sqlite [raw/CommunityDevelopmentTexts_YYYY-MM-DD.tbta.sqlite] [raw/GrammarIntroduction_YYYY-MM-DD.tbta.sqlite] [raw/MissionsDocuments_YYYY-MM-DD.tbta.sqlite] raw/Sources_YYYY-MM-DD.tabitha.sqlite`
const args = Bun.argv.slice(2)
if (args.length < 2) {
	throw new Error('Usage: bun sources/migrate.ts <Bible_db_path> [Optional_source_db_paths...] <Sources_db_path>')
}

const tabitha_db_name = args.pop()!
if (!basename(tabitha_db_name).includes('Sources')) {
	throw new Error('Sources database must be present.')
}

const tbta_sources_from_input = args // individual database names representing all of the sources

const date = basename(tabitha_db_name).match(/(\d{4}-\d{2}-\d{2})\.tabitha\.sqlite$/)?.[1]
if (!date) {
	throw new Error(`Could not extract a YYYY-MM-DD date from "${tabitha_db_name}".`)
}

const tabitha_sources_db = new Database(tabitha_db_name)

// drastic perf improvement: https://www.sqlite.org/pragma.html#pragma_journal_mode
tabitha_sources_db.run('PRAGMA journal_mode = WAL')

migrate_source_texts({ tabitha_sources_db, tbta_sources_from_input })

const sample_db_path = await resolve_sample_db_path(date)
if (sample_db_path.includes(date)) {
	const tbta_sample_db = new Database(sample_db_path, { readwrite: true, create: false })
	migrate_source_features({ tbta_db: tbta_sample_db, sources_db: tabitha_sources_db })
} else {
	log.step(`Skipping Features migration -- Sample unchanged since ${basename(sample_db_path)}.`)
}

await migrate_source_status({ runner: bun_sqlite_runner(tabitha_sources_db), csv_dir: join(import.meta.dir, '../../data/status'), date })

create_indexes(tabitha_sources_db)

log.step(`Optimizing ${tabitha_db_name}...`)
tabitha_sources_db.run('VACUUM')
log.summary()

// idx_sources_verse serves single-verse lookups; idx_sources_reference covers the DISTINCT
// book/chapter listings. NOCASE so the `type LIKE ?`/`id_primary LIKE ?` filters can use it
// (https://www.sqlite.org/optoverview.html#the_like_optimization).
function create_indexes(tabitha_sources_db: Database) {
	log.step('Creating indexes...')
	tabitha_sources_db.run('CREATE INDEX IF NOT EXISTS idx_sources_verse ON Sources (id_secondary, id_tertiary)')
	tabitha_sources_db.run('CREATE INDEX IF NOT EXISTS idx_sources_reference ON Sources (type COLLATE NOCASE, id_primary COLLATE NOCASE, id_secondary, id_tertiary)')
}

async function resolve_sample_db_path(date: string): Promise<string> {
	const path = await resolve_dated_file({ dir: 'raw', prefix: 'Sample', date, ext: 'tbta.sqlite' })
	if (!path) {
		throw new Error(`No Sample database found for ${date}, and no fallback Sample_*.tbta.sqlite file exists in raw/.`)
	}
	return path
}
