import Database from 'bun:sqlite'
import { migrate_form_names_table } from './migrate_form_names_table'
import { migrate_lexical_features_table } from './migrate_lexical_features_table'
import { migrate_source_features_table } from './migrate_source_features_table'
import { migrate_lexical_forms } from './migrate_lexical_forms'
import { migrate_lexicon_table } from './migrate_lexicon_table'
import { migrate_text_table } from './migrate_text_table'
import { migrate_ideal_text_table } from './migrate_ideal_text_table'
import { transform_inflections } from '../../data/inflections/transform'
import { basename, join } from 'path'
import { Glob } from 'bun'
import { stat } from 'fs/promises'
import { create_logger } from '../log'

const log = create_logger('Targets migration')

// usage: `bun targets/migrate.ts raw/<Project>_YYYY-MM-DD.tbta.sqlite raw/Targets_<Project>_YYYY-MM-DD.tabitha.sqlite`
// The orchestrator invokes this once per target-language project, each into its own dedicated
// output database (docs/decisions/0012-per-project-targets-databases.md) -- multiple raw inputs
// are still accepted for direct/manual invocations, but no longer merge into a shared database.
const args = Bun.argv.slice(2)
if (args.length < 2) {
	throw new Error('Usage: bun targets/migrate.ts <Project_db_path> [Additional_Project_db_paths...] <Targets_db_path>')
}

const targets_db_name = args.pop()!
if (!basename(targets_db_name).includes('Targets')) {
	throw new Error('Targets database must be present.')
}

const tbta_db_names = args

const targets_db = new Database(targets_db_name)

// drastic perf improvement: https://www.sqlite.org/pragma.html#pragma_journal_mode
targets_db.run('PRAGMA journal_mode = WAL')

// Each target-language project now migrates into its own dedicated database
// (docs/decisions/0012-per-project-targets-databases.md), so inflection CSVs -- consumed only by
// English's migrate_lexical_forms below -- only need regenerating when English is actually being
// processed this run, not on every project's invocation.
const projects = tbta_db_names.map(name => basename(name).split('_')[0])
if (projects.includes('English')) {
	await transform_inflections(join(import.meta.dir, '../../data/inflections'))
	await warn_if_inflections_stale(join(import.meta.dir, '../../data/inflections/win'))
}

for (const tbta_db_name of tbta_db_names) {
	const project = basename(tbta_db_name).split('_')[0]
	log.step(`Migrating ${project}...`)

	const tbta_db = new Database(tbta_db_name, { readwrite: true, create: false })

	migrate_text_table({ tbta_db, project, targets_db })
	migrate_lexicon_table({ tbta_db, project, targets_db })

	// Lexical forms are only implemented for English (for now).
	if (project === 'English') {
		await migrate_lexical_forms({ project, targets_db, csv_dir: join(import.meta.dir, '../../data/inflections/csv') })
	}

	migrate_form_names_table({ tbta_db, project, targets_db })
	migrate_source_features_table({ tbta_db, project, targets_db })
	migrate_lexical_features_table({ tbta_db, project, targets_db })

	await migrate_ideal_text_table({ project, targets_db, dir: join(import.meta.dir, '../../data/ideal_texts') })

	// Each project's database now holds only that project's own data, so this run's own output is
	// the only thing that needs verifying -- there's no longer a shared file where another
	// project's rows could mask this one silently producing nothing.
	const row_count = targets_db.query<{ count: number }, [string]>('SELECT COUNT(*) AS count FROM Text WHERE project = ?').get(project)?.count ?? 0
	if (row_count === 0) {
		throw new Error(`${targets_db_name} has no ${project} data in its Text table after migration.`)
	}

	tbta_db.close()
}

create_indexes(targets_db)

log.step(`Optimizing ${targets_db_name}...`)
targets_db.run('VACUUM')
log.summary()

// NOCASE so the `stem LIKE ?` lookups can use the index (https://www.sqlite.org/optoverview.html#the_like_optimization)
function create_indexes(targets_db: Database) {
	log.step('Creating indexes...')
	targets_db.run('CREATE INDEX IF NOT EXISTS idx_lexicon_stem ON Lexicon (project, stem COLLATE NOCASE)')
	targets_db.run('CREATE INDEX IF NOT EXISTS idx_text_reference ON Text (project, book, chapter, verse)')
}

async function warn_if_inflections_stale(win_dir: string): Promise<void> {
	const files = Array.from(new Glob('*.win.txt').scanSync(win_dir))
	if (files.length === 0) return

	const mtimes = await Promise.all(files.map(async file => (await stat(join(win_dir, file))).mtime.getTime()))
	const oldest = new Date(Math.min(...mtimes))
	const days_old = Math.floor((Date.now() - oldest.getTime()) / (1000 * 60 * 60 * 24))

	log.warn(`Inflections in ${win_dir} are not date-stamped and cannot be automatically verified against the English database being migrated. Oldest file was last modified ${oldest.toISOString().slice(0, 10)} (${days_old} days ago) -- confirm these were exported via tbta_utils against this run's English database before trusting lexical form data.`)
}

