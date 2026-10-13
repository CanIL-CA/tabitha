import { $, Glob } from 'bun'
import Database from 'bun:sqlite'
import { cp, mkdir, rename } from 'fs/promises'
import { existsSync } from 'fs'
import { basename, join } from 'path'
import { create_logger } from './log'
import { deploy_to_d1 } from './deploy'
import { intake } from './intake'
import { plan_migration, type TaskFamily } from './plan'
import { resolve_dated_file } from './resolve_dated_file'
import { load_state, mark_done, clear_state } from './state'
import { validate_migration_output, type ValidationConfig } from './validate'

const log = create_logger('Orchestrator')

const AUDIENCE_NAME = 'Unchurched Adults'
// Ontology and Sources_Complex are per-run generated artifacts tightly date-locked to this run's
// other outputs, not independently-versioned raw inputs -- so they're always staged fresh and
// excluded from the unchanged-content check.
const DEDUP_EXEMPT = new Set(['Ontology', 'Sources_Complex'])
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
		Ontology: {
			// Complex_Terms is the one table this migration step actually populates, so it's the
			// meaningful signal for row-count sanity here (the rest of Ontology.sqlite is the TBTA
			// export, with only NULL text columns normalized).
			row_count_table: 'Complex_Terms',
			not_null_checks: [
				{ table: 'Concepts', columns: ['gloss', 'brief_gloss', 'categorization', 'curated_examples'] },
				{ table: 'Complex_Terms', columns: ['level', 'notes'] },
			],
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
			// BEGIN TRANSACTION/COMMIT must be stripped before a `wrangler d1 execute --file` import --
			// https://developers.cloudflare.com/d1/best-practices/import-export-data/
			const raw_dump = await $`sqlite3 --escape off ${task.output_file} .dump`.text()
			const d1_importable_dump = raw_dump
				.split('\n')
				.filter(line => !/^(PRAGMA|BEGIN TRANSACTION|COMMIT)/.test(line))
				.join('\n')
			await Bun.write(dump_file, d1_importable_dump)
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

	await clear_state(date)

	log.summary()
} finally {
	await cleanup_intake?.()
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
		if (name === 'Ontology') {
			dest = derive_ontology_name()
		}
		if (name === 'Sources_Complex') {
			dest = `./raw/Sources_Complex_${date}.tabitha.sqlite`
		}

		return { name, src, dest }

		function derive_ontology_name() {
			const ontology = new Database(src, { readwrite: true, create: false })

			const row = ontology.query('SELECT version FROM Version').get() as { version: string } | null
			if (!row?.version) {
				throw new Error('Version table query returned no row or an empty version.')
			}

			const minor_version = row.version.split('.').at(-1) // 3.0.9493 => 9493
			if (!minor_version) {
				throw new Error(`Could not derive minor version from "${row.version}".`)
			}

			// close(true) releases immediately; plain close() defers until statements are finalized
			// or GC'd, which on Windows can keep a file lock alive (see migrate_source_texts.ts).
			ontology.close(true)
			return `./raw/Ontology_${minor_version}_${date}.tabitha.sqlite`
		}
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

// tbta_utils requires Sample.sqlite, Ontology.sqlite, and (for export-generated-cci) Bible.sqlite to be
// present under those exact plain names in its working directory -- which is why this runs against
// working_dir *before* those files get copied/renamed into raw/, since they're already sitting there
// under their original TBTA export names at this point.
async function run_tbta_utils(working_dir: string) {
	const has_english = await Bun.file(`${working_dir}/English.sqlite`).exists()
	if (!has_english) {
		log.warn('No English.sqlite found in the provided directory; skipping tbta_utils steps (Sources_Complex and inflections must already be staged, or this run will fail its upfront checks).')
		return
	}

	const tbta_utils = resolve_tbta_utils_binary()

	// Inflections depend only on English; Sources_Complex depends on English, Bible, and Sample.
	// Skip regenerating either when none of its actual inputs changed, rather than re-running
	// tbta_utils (export-generated-cci alone can take ~10 minutes) unconditionally every run.
	const english_changed = await is_changed({ name: 'English', src: `${working_dir}/English.sqlite` })
	const bible_changed = await file_changed_if_present('Bible')
	const sample_changed = await file_changed_if_present('Sample')

	if (english_changed) {
		log.step('Running tbta_utils export-lexical-forms...')
		await $`${tbta_utils} export-lexical-forms --language English.sqlite --output-path ${working_dir}`.cwd(working_dir)
	} else {
		log.step('Skipping tbta_utils export-lexical-forms -- English unchanged since last run.')
	}

	if (english_changed || bible_changed || sample_changed) {
		log.step('Running tbta_utils export-generated-cci (this processes the full Bible and can take ~10 minutes)...')
		await $`${tbta_utils} export-generated-cci --language English.sqlite --audience-name ${AUDIENCE_NAME} --output-path ${working_dir}/Sources_Complex.sqlite`.cwd(working_dir)
	} else {
		log.step('Skipping tbta_utils export-generated-cci -- English, Bible, and Sample all unchanged since last run.')
	}

	async function file_changed_if_present(name: string): Promise<boolean> {
		const src = `${working_dir}/${name}.sqlite`
		return await Bun.file(src).exists() && await is_changed({ name, src })
	}
}

function resolve_tbta_utils_binary(): string {
	const platform_dirs: Record<string, string> = {
		'darwin-arm64': 'darwin-arm64',
	}
	const key = `${process.platform}-${process.arch}`
	const platform_dir = platform_dirs[key]
	if (!platform_dir) {
		throw new Error(`No tbta_utils binary is vendored for platform "${key}". Currently available: ${Object.keys(platform_dirs).join(', ')} (see tools/databases/tbta_utils/).`)
	}

	const binary_path = join(import.meta.dir, '../tbta_utils', platform_dir, 'tbta_utils')
	if (!existsSync(binary_path)) {
		throw new Error(`tbta_utils binary not found at ${binary_path}.`)
	}

	return binary_path
}
