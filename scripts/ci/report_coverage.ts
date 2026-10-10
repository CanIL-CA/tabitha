import { $, Glob } from 'bun'
import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
	coverage_by_workspace,
	coverage_markdown,
	tests_by_workspace,
	vitest_workspaces,
	type CoverageSummaryJson,
	type TestResultsJson,
	type WorkspaceManifest,
} from './coverage_summary'

const root_dir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')
const coverage_dir = join(root_dir, 'coverage')
// The merged summary; CI saves it from main as the next PRs' baseline (see the unit_tests job in ci.yml).
const summary_path = join(coverage_dir, 'coverage-summary.json')
const markdown_path = join(coverage_dir, 'report.md')
// CI restores main's last summary here; locally it's usually absent, which leaves the delta out.
const baseline_dir = join(root_dir, 'coverage-baseline')
const baseline_path = join(baseline_dir, 'coverage-summary.json')
const baseline_label_path = join(baseline_dir, 'label.txt')

async function read_json<T>(path: string): Promise<T> {
	return JSON.parse(await readFile(path, 'utf-8'))
}

async function read_manifests(): Promise<WorkspaceManifest[]> {
	const manifests: WorkspaceManifest[] = []
	for (const path of new Glob('{apps,packages}/*/package.json').scanSync({ cwd: root_dir })) {
		const { scripts } = await read_json<{ scripts?: Record<string, string> }>(join(root_dir, path))
		manifests.push({ dir: path.replace(/\/package\.json$/, ''), scripts })
	}
	return manifests
}

async function run_coverage_report() {
	await rm(coverage_dir, { recursive: true, force: true })
	await mkdir(coverage_dir, { recursive: true })

	// SvelteKit's Vite plugin resolves the app from the working directory, so each workspace runs
	// in its own directory and the per-file summaries are merged here. Every workspace covers only
	// its own src/, so no file appears twice.
	const summary: CoverageSummaryJson = {}
	const results: TestResultsJson = { success: true, numTotalTests: 0, testResults: [] }
	let failed = false
	for (const dir of vitest_workspaces(await read_manifests())) {
		const out_dir = join(coverage_dir, 'workspaces', dir)
		const results_path = join(out_dir, 'test-results.json')
		console.log(`🧪 ${dir}`)
		const run = await $`bunx vitest run src --passWithNoTests --coverage --coverage.reporter=json-summary --coverage.reportsDirectory=${out_dir} --coverage.include=${'src/**/*.{js,ts,svelte}'} --coverage.exclude=${'src/lib/paraglide/**'} --reporter=dot --reporter=json --outputFile.json=${results_path}`
			.cwd(join(root_dir, dir))
			.nothrow()
		if (run.exitCode !== 0) {
			failed = true
			console.error(`❌ ${dir}: unit tests failed`)
		}

		const workspace_summary = join(out_dir, 'coverage-summary.json')
		if (existsSync(workspace_summary)) Object.assign(summary, await read_json<CoverageSummaryJson>(workspace_summary))
		if (existsSync(results_path)) {
			const workspace_results = await read_json<TestResultsJson>(results_path)
			results.testResults.push(...workspace_results.testResults)
			results.numTotalTests += workspace_results.numTotalTests
		}
	}
	delete summary.total
	await writeFile(summary_path, JSON.stringify(summary), 'utf-8')

	const coverage = coverage_by_workspace({ root_dir, summary })
	const tests = tests_by_workspace({ root_dir, results })
	const baseline = existsSync(baseline_path)
		? coverage_by_workspace({ root_dir, summary: await read_json<CoverageSummaryJson>(baseline_path) })
		: undefined
	const baseline_label = existsSync(baseline_label_path) ? (await readFile(baseline_label_path, 'utf-8')).trim() : undefined

	const markdown = coverage_markdown({ coverage, tests, baseline, baseline_label })
	await writeFile(markdown_path, markdown, 'utf-8')
	console.log(`\n${markdown}`)

	const summary_file = process.env.GITHUB_STEP_SUMMARY
	if (summary_file) await appendFile(summary_file, markdown, 'utf-8')

	if (failed) {
		console.error('❌ Unit tests failed.')
		process.exit(1)
	}
}

if (import.meta.main) {
	await run_coverage_report()
}
