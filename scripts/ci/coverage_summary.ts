import { relative, sep } from 'node:path'

export const METRICS = ['lines', 'statements', 'branches', 'functions'] as const
export type Metric = typeof METRICS[number]

export type Counts = { total: number, covered: number }
export type FileSummary = Record<Metric, Counts>

/** Vitest's `json-summary` reporter: one entry per file (absolute path) plus `total`. */
export type CoverageSummaryJson = Record<string, FileSummary>

export type WorkspaceCoverage = {
	workspace: string
	files: number
} & FileSummary

export type TestCounts = { workspace: string, test_files: number, tests: number }

/** Vitest's `json` reporter, reduced to what the report reads. */
export type TestResultsJson = {
	success: boolean
	numTotalTests: number
	testResults: { name: string, assertionResults: unknown[] }[]
}

const empty_counts = (): Counts => ({ total: 0, covered: 0 })

export type WorkspaceManifest = { dir: string, scripts?: Record<string, string> }

/** The workspaces whose unit tests run under Vitest; `tools/` and `scripts/` use `bun test` instead. */
export function vitest_workspaces(manifests: WorkspaceManifest[]): string[] {
	return manifests
		.filter(manifest => manifest.scripts?.['test:unit']?.startsWith('vitest'))
		.map(manifest => manifest.dir)
		.sort()
}

/** `apps/editor/src/x.ts` -> `apps/editor`; null for anything outside apps/ or packages/. */
export function workspace_of({ root_dir, file }: { root_dir: string, file: string }): string | null {
	const [area, name] = relative(root_dir, file).split(sep)
	if (area !== 'apps' && area !== 'packages' || !name) return null
	return `${area}/${name}`
}

export function coverage_by_workspace({ root_dir, summary }: { root_dir: string, summary: CoverageSummaryJson }): WorkspaceCoverage[] {
	const by_workspace = new Map<string, WorkspaceCoverage>()
	for (const [file, file_summary] of Object.entries(summary)) {
		if (file === 'total') continue
		const workspace = workspace_of({ root_dir, file })
		if (!workspace) continue

		const entry = by_workspace.get(workspace) ?? {
			workspace,
			files: 0,
			lines: empty_counts(),
			statements: empty_counts(),
			branches: empty_counts(),
			functions: empty_counts(),
		}
		entry.files++
		for (const metric of METRICS) {
			entry[metric].total += file_summary[metric].total
			entry[metric].covered += file_summary[metric].covered
		}
		by_workspace.set(workspace, entry)
	}
	return [...by_workspace.values()].sort((a, b) => a.workspace.localeCompare(b.workspace))
}

export function tests_by_workspace({ root_dir, results }: { root_dir: string, results: TestResultsJson }): TestCounts[] {
	const by_workspace = new Map<string, TestCounts>()
	for (const test_file of results.testResults) {
		const workspace = workspace_of({ root_dir, file: test_file.name })
		if (!workspace) continue
		const entry = by_workspace.get(workspace) ?? { workspace, test_files: 0, tests: 0 }
		entry.test_files++
		entry.tests += test_file.assertionResults.length
		by_workspace.set(workspace, entry)
	}
	return [...by_workspace.values()]
}

/** Percentage covered, or null when there is nothing to cover (a metric with no total). */
export function percent(counts: Counts): number | null {
	return counts.total === 0 ? null : counts.covered / counts.total * 100
}

function format_percent(counts: Counts): string {
	const value = percent(counts)
	return value === null ? 'n/a' : `${value.toFixed(1)}%`
}

/** Change in line coverage against the baseline, in percentage points, or '' with no baseline for it. */
export function format_delta({ current, baseline }: { current: Counts, baseline?: Counts }): string {
	if (!baseline) return ''
	const now = percent(current)
	const before = percent(baseline)
	if (now === null || before === null) return ''
	const points = now - before
	if (Math.abs(points) < 0.05) return '±0.0'
	return `${points > 0 ? '▲' : '▼'} ${Math.abs(points).toFixed(1)}`
}

export function coverage_markdown({ coverage, tests, baseline, baseline_label }: {
	coverage: WorkspaceCoverage[]
	tests: TestCounts[]
	baseline?: WorkspaceCoverage[]
	baseline_label?: string
}): string {
	const baseline_by_workspace = new Map(baseline?.map(entry => [entry.workspace, entry]))
	const tests_by_name = new Map(tests.map(entry => [entry.workspace, entry]))
	const total_tests = tests.reduce((sum, entry) => sum + entry.tests, 0)
	const total_test_files = tests.reduce((sum, entry) => sum + entry.test_files, 0)

	const rows = coverage.map(entry => {
		const test_counts = tests_by_name.get(entry.workspace)
		const delta = format_delta({ current: entry.lines, baseline: baseline_by_workspace.get(entry.workspace)?.lines })
		const cells = [
			`\`${entry.workspace}\``,
			format_percent(entry.lines),
			...baseline ? [delta] : [],
			format_percent(entry.statements),
			format_percent(entry.branches),
			format_percent(entry.functions),
			String(test_counts?.tests ?? 0),
		]
		return `| ${cells.join(' | ')} |`
	})

	const headers = ['Workspace', 'Lines', ...baseline ? ['Δ lines'] : [], 'Statements', 'Branches', 'Functions', 'Tests']
	return [
		'### 📊 Unit test coverage',
		'',
		`${total_tests} tests in ${total_test_files} files.${baseline ? ` Δ is percentage points against ${baseline_label ?? 'the main baseline'}.` : ' No main baseline was available, so there is no Δ column.'}`,
		'',
		`| ${headers.join(' | ')} |`,
		`| ${headers.map(() => '---').join(' | ')} |`,
		...rows,
		'',
		'`tools/` and `scripts/` run under `bun test` and are not in this report.',
		'',
	].join('\n')
}
