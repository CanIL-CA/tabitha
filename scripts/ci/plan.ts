import { $ } from 'bun'
import { appendFile, readFile } from 'node:fs/promises'
import {
	get_changed_workspace_packages,
	resolve_diff_base,
	type WorkspacePackage,
} from '../audits/check_missing_bin_deps'

// `get_workspace_packages()` (used internally by `get_changed_workspace_packages`) points the
// synthetic `scripts` pseudo-package at the *root* package.json -- stale from before scripts/
// had its own package.json. It has one now (`@tabitha/scripts`), so its real name is hardcoded
// here rather than trusting that path.
const SCRIPTS_PACKAGE_NAME = '@tabitha/scripts'

// Paths that touch monorepo-wide infrastructure closely enough that a scoped run can't be
// trusted to catch a regression -- any change here forces every job to run in full. Workflow/
// composite-action changes validate the pipeline itself; the rest are inputs no turbo per-
// package filter can see (a lockfile bump can change what every package actually resolves to).
const FORCE_FULL_PREFIXES = ['.github/workflows/', '.github/actions/']
const FORCE_FULL_EXACT = new Set(['package.json', 'bun.lock', 'turbo.json'])

// Windows has no equivalent to Stage 2's `windows-latest`-billed job running on every PR --
// unlike run_build/run_quality/run_unit/run_e2e, this stays scoped to the specific paths where a
// Windows-only regression has actually happened before (see ADR 0011), rather than "any code
// change, full stop".
const WINDOWS_SMOKE_PREFIXES = ['scripts/dx/', 'tools/databases/']

export function touches_windows_smoke_paths(changed_files: string[]): boolean {
	return changed_files.some(file => WINDOWS_SMOKE_PREFIXES.some(prefix => file.startsWith(prefix)))
}

export type CiPlan = {
	base_ref: string | undefined
	changed_files: string[]
	changed_package_names: string[]
	turbo_filter_args: string[]
	run_build: boolean
	run_quality: boolean
	run_unit: boolean
	run_e2e: boolean
	run_windows_smoke: boolean
	reason: string
}

export type FileClassification =
	| { kind: 'no_changes' }
	| { kind: 'force_full', matched_file: string }
	| { kind: 'docs_only' }
	| { kind: 'scoped' }

// Pure and git-free on purpose -- exercised directly in plan.test.ts without touching a real repo.
export function classify_files(changed_files: string[]): FileClassification {
	if (changed_files.length === 0) return { kind: 'no_changes' }

	const force_full_match = changed_files.find(
		file => FORCE_FULL_EXACT.has(file) || FORCE_FULL_PREFIXES.some(prefix => file.startsWith(prefix)),
	)
	if (force_full_match) return { kind: 'force_full', matched_file: force_full_match }

	const docs_only = changed_files.every(file => file.toLowerCase().endsWith('.md'))
	return docs_only ? { kind: 'docs_only' } : { kind: 'scoped' }
}

// Pure and git-free on purpose -- exercised directly in plan.test.ts without touching a real repo.
//
// `--filter=...<pkg>` selects the package *and every workspace package that depends on it*,
// walking real package.json dependency edges -- not turbo's own git-diff-based `--affected`,
// which is unreliable from a linked worktree (vercel/turborepo#5217: it hardcodes the git index
// path as <repo_root>/.git/index, which doesn't exist in a worktree). Revisit this hand-rolled
// diff once that's fixed upstream -- this script may no longer be needed.
//
// The dots go *before* the name, not after: `<pkg>...` (dots after) walks the other direction,
// toward <pkg>'s own dependencies rather than its dependents.
export function build_turbo_filter_args(changed_package_names: string[]): string[] {
	return changed_package_names.map(name => `--filter=...${name}`)
}

function skip_everything_plan({ base_ref, changed_files, reason }: {
	base_ref: string | undefined
	changed_files: string[]
	reason: string
}): CiPlan {
	return {
		base_ref,
		changed_files,
		changed_package_names: [],
		turbo_filter_args: [],
		run_build: false,
		run_quality: false,
		run_unit: false,
		run_e2e: false,
		run_windows_smoke: false,
		reason,
	}
}

function run_everything_plan({ base_ref, changed_files, reason }: {
	base_ref: string | undefined
	changed_files: string[]
	reason: string
}): CiPlan {
	return {
		base_ref,
		changed_files,
		changed_package_names: [],
		turbo_filter_args: [],
		run_build: true,
		run_quality: true,
		run_unit: true,
		run_e2e: true,
		run_windows_smoke: true,
		reason,
	}
}

async function get_package_npm_name(pkg: WorkspacePackage): Promise<string> {
	if (pkg.name === 'scripts') return SCRIPTS_PACKAGE_NAME
	const content = await readFile(pkg.package_json_path, 'utf-8')
	return (JSON.parse(content) as { name: string }).name
}

export async function build_ci_plan(): Promise<CiPlan> {
	const base_ref = await resolve_diff_base()
	if (!base_ref) {
		return run_everything_plan({ base_ref, changed_files: [], reason: 'no git history available to diff against -- running everything to be safe' })
	}

	const diff_output = (await $`git diff --name-only ${base_ref}...HEAD`.text()).trim()
	const changed_files = diff_output ? diff_output.split('\n') : []

	const classification = classify_files(changed_files)

	if (classification.kind === 'no_changes') {
		return skip_everything_plan({ base_ref, changed_files, reason: 'no changes detected against base' })
	}
	if (classification.kind === 'force_full') {
		return run_everything_plan({ base_ref, changed_files, reason: `touches monorepo-wide infrastructure (${classification.matched_file})` })
	}
	if (classification.kind === 'docs_only') {
		return skip_everything_plan({ base_ref, changed_files, reason: `docs-only change (${changed_files.length} markdown file(s))` })
	}

	const changed_packages = await get_changed_workspace_packages(base_ref)
	if (changed_packages.length === 0) {
		return run_everything_plan({ base_ref, changed_files, reason: 'change does not map to a known workspace package -- running everything to be safe' })
	}

	const changed_package_names = await Promise.all(changed_packages.map(get_package_npm_name))
	const turbo_filter_args = build_turbo_filter_args(changed_package_names)

	return {
		base_ref,
		changed_files,
		changed_package_names,
		turbo_filter_args,
		run_build: true,
		run_quality: true,
		// Unlike build/quality, unit and e2e are never scoped by the turbo filter above -- see
		// the ADR (docs/decisions/0008-ci-change-scoping.md) for why each stays all-or-nothing.
		run_unit: true,
		run_e2e: true,
		run_windows_smoke: touches_windows_smoke_paths(changed_files),
		reason: `scoped to ${changed_package_names.length} package(s) + dependents: ${changed_package_names.join(', ')}`,
	}
}

function print_plan(plan: CiPlan) {
	console.log(`
============================================================
       🧭 TaBiThA CI Change Plan
============================================================
`)
	console.log(`Base ref:  ${plan.base_ref ?? '(none)'}`)
	console.log(`Changed:   ${plan.changed_files.length} file(s)`)
	console.log(`Decision:  ${plan.reason}\n`)

	const row = ({ label, run }: {
		label: string
		run: boolean
	}) => console.log(`  ${run ? '✅ run  ' : '⏭️  skip '} ${label}`)
	row({ label: 'production_build (build)', run: plan.run_build })
	row({ label: 'code_quality (typecheck & eslint)', run: plan.run_quality })
	row({ label: 'unit_tests (coverage)', run: plan.run_unit })
	row({ label: 'e2e_tests (Playwright)', run: plan.run_e2e })
	row({ label: 'windows_dx_smoke (db:load & unit tests on windows-latest)', run: plan.run_windows_smoke })

	if (plan.turbo_filter_args.length > 0) {
		console.log(`\n  turbo filter: ${plan.turbo_filter_args.join(' ')}`)
	}
	console.log('')
}

async function write_github_output(plan: CiPlan) {
	const output_path = process.env.GITHUB_OUTPUT
	if (!output_path) return
	const lines = [
		`run_build=${plan.run_build}`,
		`run_quality=${plan.run_quality}`,
		`run_unit=${plan.run_unit}`,
		`run_e2e=${plan.run_e2e}`,
		`run_windows_smoke=${plan.run_windows_smoke}`,
		`turbo_filter=${plan.turbo_filter_args.join(' ')}`,
		`reason=${plan.reason.replace(/\n/g, ' ')}`,
	]
	await appendFile(output_path, lines.join('\n') + '\n')
}

async function execute_plan(plan: CiPlan) {
	console.log('▶️  Running audits (always-on)...\n')
	await $`bun run check:audits`

	if (plan.run_build) {
		console.log('\n▶️  Running production build...\n')
		await $`bunx turbo run build:ci ${plan.turbo_filter_args}`
	}
	if (plan.run_quality) {
		console.log('\n▶️  Running typecheck & lint...\n')
		await $`bunx turbo run check ${plan.turbo_filter_args}`
		await $`bunx turbo run check:lint ${plan.turbo_filter_args}`
	}
	if (plan.run_unit) {
		console.log('\n▶️  Running unit tests & coverage...\n')
		await $`bun run test:coverage`
	}
	if (plan.run_e2e) {
		console.log('\n▶️  Running Playwright e2e suite...\n')
		await $`bun run test:e2e`
	}
}

if (import.meta.main) {
	const plan = await build_ci_plan()
	print_plan(plan)
	if (process.env.GITHUB_ACTIONS === 'true') {
		await write_github_output(plan)
	}
	if (process.argv.includes('--run')) {
		await execute_plan(plan)
	}
}
