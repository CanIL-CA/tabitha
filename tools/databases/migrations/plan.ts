import { Glob } from 'bun'
import { TARGET_PROJECTS } from '@tabitha/types/target'
import { resolve_dated_file } from './resolve_dated_file'

// One task per target-language project (docs/decisions/0012-per-project-targets-databases.md), each
// independently plannable/rebuildable/deployable -- `family` groups them back for validation config
// and script-directory lookup, since only `id` (not `family`) is granular enough for state tracking.
export type TaskFamily = 'Sources' | 'Ontology' | 'Targets'
export type TaskId = 'Sources' | 'Ontology' | `Targets_${typeof TARGET_PROJECTS[number]}`

export type PlannedTask = {
	id: TaskId
	family: TaskFamily
	// Whether this task will do real work this run -- false means every one of its inputs was
	// determined unchanged at staging time, so the prior output is left in place untouched.
	changed: boolean
	reason: string
	// Only the inputs that actually need reprocessing (for a dedup-eligible task with a prior
	// output to copy forward from), or every resolved input otherwise.
	migrate_args: string[]
	output_file: string
	previous_output_file?: string
}

export type MigrationPlan = {
	date: string
	tasks: PlannedTask[]
}

const SOURCES_INPUTS = ['Bible', 'CommunityDevelopmentTexts', 'GrammarIntroduction', 'MissionsDocuments']

/**
 * Walks the migration pipeline's dependency graph for a given run date, resolving every task's
 * actual inputs (fresh vs. carried-forward latest) and deciding whether each needs to run at all,
 * without executing anything. This is the one place "which file to use" is decided -- staging's
 * content-hash dedup already determined per-input freshness (encoded in each resolved file's own
 * date), so planning only needs to read that back, not recompute it.
 */
export async function plan_migration(date: string): Promise<MigrationPlan> {
	const sources_task = await plan_rebuild_task('Sources', 'Sources', SOURCES_INPUTS, date, { hard_required: [] })
	const ontology_task = await plan_ontology_task(date, sources_task)
	// Each target-language project is its own independent task: unlike the old single shared
	// Targets database, one project's migration no longer requires any other project (including
	// English) to be present or unchanged -- that's the isolation the per-project split is for.
	// None are hard-required at plan time; a project with no raw file staged yet (e.g. mid-onboarding)
	// simply has nothing to build, rather than failing every other project's migration too.
	const targets_tasks = await Promise.all(
		TARGET_PROJECTS.map(project => plan_rebuild_task(`Targets_${project}`, 'Targets', [project], date, { hard_required: [] })),
	)

	return { date, tasks: [sources_task, ontology_task, ...targets_tasks] }
}

async function plan_rebuild_task(id: TaskId, family: TaskFamily, input_names: string[], date: string, { hard_required }: { hard_required: string[] }): Promise<PlannedTask> {
	const resolved = await Promise.all(input_names.map(async name => ({ name, path: await resolve_dated_file('raw', name, date, 'tbta.sqlite') })))

	for (const name of hard_required) {
		if (!resolved.find(r => r.name === name)?.path) {
			throw new Error(`${name} database not found for ${id} migration.`)
		}
	}

	const present = resolved.filter((r): r is { name: string, path: string } => Boolean(r.path))
	const all_inputs = present.map(r => r.path)
	const changed_inputs = present.filter(r => extract_date(r.path) === date).map(r => r.path)

	const previous_output_file = await latest_previous_output_file(id, date)
	// present.length === 0 means no raw input has ever been staged for this task -- distinct from
	// "no prior output exists", which without this check would otherwise read as "do a full build"
	// with nothing to build from (relevant once a project can be registered before its first raw
	// file lands, now that each target-language project is independently plannable).
	const changed = present.length > 0 && (changed_inputs.length > 0 || !previous_output_file)

	const output_file = changed ? `raw/${id}_${date}.tabitha.sqlite` : previous_output_file!

	return {
		id,
		changed,
		reason: describe_reason(),
		migrate_args: !changed ? [] : previous_output_file ? changed_inputs : all_inputs,
		output_file,
		previous_output_file,
		family,
	}

	function describe_reason(): string {
		if (present.length === 0) return 'no raw input has ever been staged for this task'
		if (!changed) return `no inputs changed since ${previous_output_file}`
		if (previous_output_file) return `${changed_inputs.length}/${all_inputs.length} input(s) changed`
		return 'no prior output exists -- full build'
	}
}

async function plan_ontology_task(date: string, sources_task: PlannedTask): Promise<PlannedTask> {
	// See latest_previous_output_file's comment: scan from 'raw' rather than baking it into the
	// pattern, so the match stays a bare filename regardless of OS-native separator handling.
	const matched_file = Array.from(new Glob(`Ontology_*_${date}.tabitha.sqlite`).scanSync('raw'))[0]
	if (!matched_file) {
		// The Ontology's Exhaustive_Examples are built from Sources, so a Sources change still needs a
		// fresh Ontology delivered alongside it. Without one, a delivery holding only target-language
		// databases leaves the deployed Ontology as it is.
		const previous_file = latest_previous_ontology_file(date)
		if (sources_task.changed || !previous_file) {
			throw new Error(`No staged Ontology database found for ${date}. An Ontology.sqlite (or .new) file must be delivered whenever Sources changes.`)
		}

		return {
			id: 'Ontology',
			family: 'Ontology',
			changed: false,
			reason: 'no Ontology delivered and Sources unchanged',
			migrate_args: [],
			output_file: `raw/${previous_file}`,
		}
	}

	// Sources_Complex is generated during staging (via tbta_utils) and may itself have been left
	// unchanged there -- resolve whichever one actually exists, which may be an older date than
	// today's Ontology/Sources files.
	const sources_complex_file = await resolve_dated_file('raw', 'Sources_Complex', date, 'tabitha.sqlite')
	if (!sources_complex_file) {
		throw new Error(`No Sources_Complex database found for ${date} (or any prior date). This is normally generated automatically via "tbta_utils export-generated-cci" during staging.`)
	}

	return {
		id: 'Ontology',
		family: 'Ontology',
		changed: true,
		reason: 'Ontology is exempt from staging dedup and always regenerated fresh.',
		migrate_args: [sources_task.output_file, sources_complex_file],
		output_file: `raw/${matched_file}`,
	}
}

// Sorted by the date suffix rather than the whole name, since the Ontology version sits in front of it.
function latest_previous_ontology_file(date: string): string | undefined {
	return Array.from(new Glob('Ontology_*_????-??-??.tabitha.sqlite').scanSync('raw'))
		.filter(file => extract_date(file) !== date)
		.toSorted((a, b) => extract_date(a)!.localeCompare(extract_date(b)!))
		.at(-1)
}

// A raw input's resolved path carries the date it was actually staged under (see staging's
// content-hash dedup) -- if that date isn't today's run date, staging determined it was unchanged
// and skipped restaging it, so it doesn't need reprocessing this run.
function extract_date(path: string): string | undefined {
	return path.match(/_(\d{4}-\d{2}-\d{2})\.(?:tbta|tabitha)\.sqlite$/)?.[1]
}

// The prior run's output to copy forward from -- explicitly excludes today's date, since a
// resumed run may already have a partially-written today's file on disk that must not be
// mistaken for "the previous run's" output.
async function latest_previous_output_file(id: string, date: string): Promise<string | undefined> {
	// Scanning from 'raw' (rather than baking it into the pattern and scanning from '.') keeps the
	// match a bare filename -- Bun's Glob otherwise returns the traversed directory portion using the
	// OS-native separator, which broke this on Windows (backslash) despite the forward-slash pattern.
	// A date-shaped wildcard, not `*`, so e.g. Sources never matches Sources_Complex_* (which would
	// otherwise sort after every Sources_<date> file and be picked as "the latest Sources output").
	const files = Array.from(new Glob(`${id}_????-??-??.tabitha.sqlite`).scanSync('raw')).filter(file => !file.includes(`_${date}.`))
	files.sort() // lexicographical sort will serve correctly for YYYY-MM-DD
	const latest = files.pop()
	return latest ? `raw/${latest}` : undefined
}
