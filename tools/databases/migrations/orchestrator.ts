import { $, Glob } from 'bun'
import { Database } from 'bun:sqlite'
import { cp, mkdir, rename } from 'fs/promises'
import { basename, join } from 'path'
import { create_logger } from './log'
import { deploy_to_d1 } from './deploy'
import { intake } from './intake'
import { rebuild_examples } from './ontology/examples'
import { to_d1_importable } from './ontology/live'
import { plan_migration, type TaskFamily } from './plan'
import { resolve_dated_file } from './resolve_dated_file'
import { download_ontology_backup, read_ontology_version } from './live_ontology_backup'
import { stale_status_csvs, stale_status_message } from './sources/status_freshness'
import { load_state, mark_done, clear_state } from './state'
import { assert_pinned_release_is_latest, tbta_utils_binary, to_sources_complex } from './tbta_utils'
import { validate_migration_output, type ValidationConfig } from './validate'

const log = create_logger('Orchestrator')

const AUDIENCE_NAME = 'Unchurched Adults'
// Sources_Complex is a per-run generated artifact tightly date-locked to this run's other outputs,
// not an independently-versioned raw input -- so it's always staged fresh and excluded from the
// unchanged-content check.
const DEDUP_EXEMPT = new Set(['Sources_Complex'])
// A delivered Ontology.sqlite is never staged or used: tbta_utils gets the live backup matching
// English, since the live Ontology D1 is the source of truth
// (docs/decisions/0025-ontology-d1-single-source-of-truth.md).
const NOT_STAGED = new Set(['Ontology'])
const USAGE = 'Usage: bun migrate.ts "<directory or zip containing all necessary TBTA dbs>" YYYY-MM-DD'

if (!Bun.which('sqlite3')) {
	throw new Error('sqlite3 is not installed. Please install it and try again.')
}

const can_prompt = !!process.stdin.isTTY

const source_arg = Bun.argv[2] || (can_prompt ? prompt('Directory or zip containing all necessary TBTA dbs:') : null) // "~/Downloads/TBTA 9-25-25" or "~/Downloads/TBTA 9-25-25.zip"
if (!source_arg) {
	throw new Error(USAGE)
}

const today = new Date().toISOString().slice(0, 10)
const date = Bun.argv[3] || (can_prompt ? prompt('Date for this migration run (YYYY-MM-DD):', today) : null) || today // 2025-09-25
if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
	throw new Error(`Invalid date "${date}". Expected format YYYY-MM-DD.`)
}

if (!process.env.LOG_LEVEL && can_prompt) {
	const verbose = confirm('Show verbose output (per-item detail and sample data dumps)?')
	process.env.LOG_LEVEL = verbose ? 'verbose' : 'normal'
}

const { working_dir: dir_w_tbta_dbs, cleanup: cleanup_intake } = await intake(source_arg)

try {
	let completed_steps = await load_state(date)
	if (completed_steps.size > 0) {
		log.step(`Found an incomplete run for ${date} (${completed_steps.size} step(s) already done).`)
		const resume = can_prompt ? confirm('Resume from where it left off? (No = start this date over)') : true
		if (!resume) {
			await clear_state(date)
			completed_steps = new Set()
		}
	}

	if (completed_steps.has('staging')) {
		log.step('Skipping staging (already completed for this run).')
	} else {
		await stage_tbta_files(dir_w_tbta_dbs)
		await mark_done({ date, step: 'staging', completed_steps })
	}

	// Keyed by family, not task id -- every per-project Targets_<project> task shares the same
	// validation shape (docs/decisions/0012-per-project-targets-databases.md).
	const VALIDATIONS: Record<TaskFamily, ValidationConfig> = {
		Sources: {
			// The source Bible text is expected to be complete, so every canonical book must be present.
			book_check: { table: 'Sources', book_column: 'id_primary', where: "type = 'Bible'", require_complete: true },
			duplicate_check: { table: 'Sources', columns: ['type', 'id_primary', 'id_secondary', 'id_tertiary'] },
			row_count_table: 'Sources',
		},
		Targets: {
			// Per-language translation output is expected to only partially cover the canon while
			// in progress, so only unexpected/misspelled book names fail this check, not missing ones.
			book_check: { table: 'Text', book_column: 'book', require_complete: false },
			duplicate_check: { table: 'Text', columns: ['project', 'book', 'chapter', 'verse', 'audience'] },
			row_count_table: 'Text',
		},
	}

	// Resolves the full dependency graph for this date -- which raw inputs changed, which outputs
	// need rebuilding (and with which inputs), and which can be skipped entirely -- before anything
	// is actually executed.
	const plan = await plan_migration(date)

	// Verse status CSVs are a manual export, so tell the operator before the long steps start, and again at the end.
	const status_dir = join(import.meta.dir, '../data/status')
	const stale_status = plan.tasks.some(task => task.id === 'Sources' && task.changed) ? stale_status_csvs({ csv_dir: status_dir, date }) : []
	if (stale_status.length > 0) log.warn(stale_status_message({ stale: stale_status, date }))

	for (const task of plan.tasks) {
		const migrated_step = `${task.id}:migrated` as const
		const dumped_step = `${task.id}:dumped` as const
		const deployed_step = `${task.id}:deployed` as const

		if (!task.changed) {
			log.step(`Skipping ${task.id} migration entirely -- ${task.reason}.`)
			continue
		}

		const dump_file = `snapshots/${basename(task.output_file)}.sql`

		if (completed_steps.has(migrated_step)) {
			log.step(`Skipping ${task.id} migration (already completed for this run).`)
		} else {
			log.step(`Migrating ${task.id} database (${task.reason})...`)
			if (task.previous_output_file) {
				log.step(`Copying forward ${basename(task.previous_output_file)} -> ${basename(task.output_file)}...`)
				await cp(task.previous_output_file, task.output_file)
			}
			await $`bun migrations/${task.family.toLowerCase()}/migrate.ts ${task.migrate_args} ${task.output_file}`
			await mark_done({ date, step: migrated_step, completed_steps })
		}

		if (completed_steps.has(dumped_step)) {
			log.step(`Skipping ${task.id} dump (already completed for this run).`)
		} else {
			log.step(`Creating dump of ${task.id} database...`)
			const raw_dump = await $`sqlite3 --escape off ${task.output_file} .dump`.text()
			await Bun.write(dump_file, to_d1_importable(raw_dump))
			await mark_done({ date, step: dumped_step, completed_steps })
		}

		// Always re-run validation, even on a resumed run -- this is the last gate before a D1 deploy,
		// so it must reflect the actual state of output_file every time, not just the first pass.
		await validate_migration_output({ key: task.id, db_path: task.output_file, date, config: VALIDATIONS[task.family] })

		if (completed_steps.has(deployed_step)) {
			log.step(`Skipping ${task.id} D1 deploy (already completed for this run).`)
		} else {
			await deploy_to_d1({ task, dump_file, date })
			await mark_done({ date, step: deployed_step, completed_steps })
		}
	}

	// The Ontology's Exhaustive_Examples are built from Sources, so a new Sources build rebuilds them
	// in the live Ontology D1. Only the Previews copy here: like the new Sources database, production
	// moves once the branch merges, by running the printed command.
	const sources_task = plan.tasks.find(task => task.id === 'Sources')
	if (sources_task?.changed) {
		const sources_complex_file = await resolve_dated_file({ dir: 'raw', prefix: 'Sources_Complex', date, ext: 'tabitha.sqlite' })
		if (!sources_complex_file) {
			throw new Error(`No Sources_Complex database found for ${date} (or any prior date). This is normally generated automatically via "tbta-utils bulk-generate" during staging.`)
		}

		const examples_step = 'Ontology_examples:preview'
		if (completed_steps.has(examples_step)) {
			log.step('Skipping the Previews Ontology examples rebuild (already completed for this run).')
		} else {
			await rebuild_examples({ target: 'preview', sources_file: sources_task.output_file, sources_complex_file })
			await mark_done({ date, step: examples_step, completed_steps })
		}

		log.warn(`After this branch merges, rebuild production's Ontology examples: bun run examples:rebuild production ${sources_task.output_file} ${sources_complex_file}`)
	}

	if (stale_status.length > 0) log.warn(stale_status_message({ stale: stale_status, date }))

	await clear_state(date)

	log.summary()
	await cleanup_intake()
} catch (error) {
	log.warn(`Kept the working directory for inspection (TBTA.log, tbta_utils output): ${dir_w_tbta_dbs}`)
	throw error
}

async function stage_tbta_files(working_dir: string) {
	for await (const file of new Glob('*.new').scan(working_dir)) {
		await rename(`${working_dir}/${file}`, `${working_dir}/${file.replace('.new', '.sqlite')}`)
	}

	await run_tbta_utils(working_dir)

	const sqlite_files = Array.from(new Glob('*.sqlite').scanSync(working_dir))
	log.step(`Staging: ${sqlite_files.join(', ')}`)
	await Promise.all(stage(sqlite_files))

	await stage_win_files(working_dir)

	function stage(db_names: string[]): Promise<void>[] {
		return db_names
			.map(db_name => basename(db_name, '.sqlite')) // e.g., ~/Downloads/2025-09-25/Bible.sqlite => Bible
			.filter(Boolean) // remove empty strings
			.filter(name => !NOT_STAGED.has(name))
			.map(normalize_name)
			.map(stage_one)
	}

	async function stage_one({ name, src, dest }: { name: string, src: string, dest: string }) {
		if (!DEDUP_EXEMPT.has(name) && !await is_changed({ name, src })) {
			log.step(`Skipping stage of ${name}: unchanged since last run.`)
			return
		}

		await cp(src, dest)
	}

	function normalize_name(name: string) {
		const src = `${working_dir}/${name}.sqlite`

		let dest = `./raw/${name}_${date}.tbta.sqlite`
		if (name === 'Sources_Complex') {
			dest = `./raw/Sources_Complex_${date}.tabitha.sqlite`
		}

		return { name, src, dest }
	}
}

// True if `src` (a freshly-delivered raw file) differs from the current latest staged
// raw/{name}_*.tbta.sqlite. Treated as changed (the safe default) when there's nothing to compare
// against yet -- which also covers a manifest-listed raw/ file that hasn't been pulled from R2 yet
// (see r2_sync.ts; run "bun run r2:pull -- raw" in tools/databases before migrating).
async function is_changed({ name, src }: {
	name: string
	src: string
}): Promise<boolean> {
	const latest = await resolve_dated_file({ dir: 'raw', prefix: name, date, ext: 'tbta.sqlite', silent: true })
	if (!latest) return true

	return await content_hash(src) !== await content_hash(latest)
}

async function content_hash(path: string): Promise<string> {
	const hasher = new Bun.CryptoHasher('sha256')
	for await (const chunk of Bun.file(path).stream()) {
		hasher.update(chunk)
	}
	return hasher.digest('hex')
}

async function stage_win_files(working_dir: string) {
	const win_dest_dir = join(import.meta.dir, '../data/inflections/win')
	await mkdir(win_dest_dir, { recursive: true })

	const win_files = Array.from(new Glob('*.win.txt').scanSync(working_dir))
	await Promise.all(win_files.map(async file => await cp(`${working_dir}/${file}`, `${win_dest_dir}/${file}`)))
}

// Generates the inflection files and Sources_Complex from the delivered English, before staging.
async function run_tbta_utils(working_dir: string) {
	const has_english = await Bun.file(`${working_dir}/English.sqlite`).exists()
	if (!has_english) {
		log.warn('No English.sqlite found in the provided directory; skipping tbta_utils steps (Sources_Complex and inflections must already be staged, or this run will fail its upfront checks).')
		return
	}

	await assert_pinned_release_is_latest()
	const tbta_utils = await tbta_utils_binary()

	// Inflections depend only on English; Sources_Complex depends on English, Bible, and Sample.
	// Skip regenerating either when none of its actual inputs changed, rather than re-running
	// tbta_utils (bulk-generate alone can take ~10 minutes) unconditionally every run.
	const english_changed = await is_changed({ name: 'English', src: `${working_dir}/English.sqlite` })
	const bible_changed = await file_changed_if_present('Bible')
	const sample_changed = await file_changed_if_present('Sample')
	const cci_needed = english_changed || bible_changed || sample_changed

	// tbta_utils reads English, Bible, Sample and Ontology under those plain names from its working
	// directory. It runs in a subfolder, so its copies (the live Ontology, companions from raw/) never
	// reach staging, which only scans working_dir itself.
	const run_dir = join(working_dir, 'tbta_utils')
	if (cci_needed) {
		await prepare_run_dir()
	}

	if (english_changed) {
		log.step('Running tbta_utils export-lexical-forms...')
		await $`${tbta_utils} export-lexical-forms --language English.sqlite --output-path ${working_dir}`.cwd(run_dir)
	} else {
		log.step('Skipping tbta_utils export-lexical-forms -- English unchanged since last run.')
	}

	if (cci_needed) {
		log.step('Running tbta-utils bulk-generate up to Complex Concept Insertion (this processes the full Bible and can take ~10 minutes)...')
		const bulk_generated = `${run_dir}/bulk-generate.sqlite`
		await $`${tbta_utils} bulk-generate --language English.sqlite --audience-name ${AUDIENCE_NAME} --quit-after ComplexConceptInsertion --output-path ${bulk_generated}`.cwd(run_dir)
		to_sources_complex({ bulk_generated, sources_complex: `${working_dir}/Sources_Complex.sqlite` })
		await assert_complete_cci(`${working_dir}/Sources_Complex.sqlite`)
	} else {
		log.step('Skipping tbta-utils bulk-generate -- English, Bible, and Sample all unchanged since last run.')
	}

	async function prepare_run_dir() {
		await mkdir(run_dir, { recursive: true })

		await cp(`${working_dir}/English.sqlite`, `${run_dir}/English.sqlite`)

		const version = read_ontology_version({ db_path: `${working_dir}/English.sqlite` })
		log.step(`Downloading the live Ontology backup ${version}, which English.sqlite is mapped to...`)
		await download_ontology_backup({ version, dest: `${run_dir}/Ontology.sqlite` })

		await copy_companion('Bible')
		await copy_companion('Sample')
	}

	// A delivery only carries what changed, so a companion it lacks comes from the latest staged copy.
	async function copy_companion(name: string) {
		const delivered = `${working_dir}/${name}.sqlite`
		if (await Bun.file(delivered).exists()) {
			await cp(delivered, `${run_dir}/${name}.sqlite`)
			return
		}

		const latest = await resolve_dated_file({ dir: 'raw', prefix: name, date, ext: 'tbta.sqlite', silent: true })
		if (!latest) throw new Error(`tbta_utils needs ${name}.sqlite, and neither the delivery nor raw/ has one (run "bun run r2:pull -- raw").`)

		log.step(`Using ${basename(latest)} as ${name}.sqlite for tbta_utils (not in this delivery).`)
		await cp(latest, `${run_dir}/${name}.sqlite`)
	}

	// tbta_utils exits 0 even when it fails, and a failing verse silently ends the export there, so
	// judge it by its output: every book the previous export covered must still be there.
	async function assert_complete_cci(path: string) {
		const books = complex_books(path)
		if (books.size === 0) throw new Error(`tbta-utils bulk-generate produced no rows in ${path}; see TBTA.log in ${run_dir}.`)

		const previous = await resolve_dated_file({ dir: 'raw', prefix: 'Sources_Complex', date, ext: 'tabitha.sqlite', silent: true })
		if (!previous) return

		const missing = [...complex_books(previous)].filter(book => !books.has(book))
		if (missing.length > 0) {
			throw new Error(`tbta-utils bulk-generate stopped early: ${missing.length} book(s) from ${basename(previous)} are missing (${missing.join(', ')}). See "An error occurred" in TBTA.log in ${run_dir}.`)
		}
	}

	function complex_books(path: string): Set<string> {
		const db = new Database(path, { readonly: true })
		try {
			return new Set(db.query<{ book: string }, []>('SELECT DISTINCT id_primary AS book FROM Sources').all().map(row => row.book))
		} finally {
			db.close()
		}
	}

	async function file_changed_if_present(name: string): Promise<boolean> {
		const src = `${working_dir}/${name}.sqlite`
		return await Bun.file(src).exists() && await is_changed({ name, src })
	}
}
