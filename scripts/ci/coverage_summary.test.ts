import { describe, expect, it } from 'bun:test'
import {
	coverage_by_workspace,
	coverage_markdown,
	format_delta,
	percent,
	tests_by_workspace,
	vitest_workspaces,
	workspace_of,
	type FileSummary,
} from './coverage_summary'

const ROOT = '/repo'

function file_summary({ covered, total }: { covered: number, total: number }): FileSummary {
	return {
		lines: { covered, total },
		statements: { covered, total },
		branches: { covered, total },
		functions: { covered, total },
	}
}

describe('vitest_workspaces', () => {
	it('keeps only workspaces whose unit tests run under Vitest', () => {
		expect(vitest_workspaces([
			{ dir: 'packages/ui', scripts: { 'test:unit': 'vitest run src' } },
			{ dir: 'apps/editor', scripts: { 'test:unit': 'vitest run src' } },
			{ dir: 'tools/dns', scripts: { 'test:unit': 'bun test' } },
			{ dir: 'apps/www', scripts: { build: 'vite build' } },
			{ dir: 'packages/tsconfig' },
		])).toEqual(['apps/editor', 'packages/ui'])
	})
})

describe('workspace_of', () => {
	it('names the app or package a file belongs to', () => {
		expect(workspace_of({ root_dir: ROOT, file: '/repo/apps/editor/src/lib/parser.ts' })).toBe('apps/editor')
		expect(workspace_of({ root_dir: ROOT, file: '/repo/packages/ui/src/Footer.svelte' })).toBe('packages/ui')
	})

	it('ignores files outside apps/ and packages/', () => {
		expect(workspace_of({ root_dir: ROOT, file: '/repo/scripts/ci/plan.ts' })).toBeNull()
		expect(workspace_of({ root_dir: ROOT, file: '/repo/apps' })).toBeNull()
	})
})

describe('coverage_by_workspace', () => {
	it('sums each workspace\'s files and skips the overall total', () => {
		const coverage = coverage_by_workspace({
			root_dir: ROOT,
			summary: {
				'total': file_summary({ covered: 99, total: 99 }),
				'/repo/apps/editor/src/a.ts': file_summary({ covered: 3, total: 4 }),
				'/repo/apps/editor/src/b.ts': file_summary({ covered: 1, total: 6 }),
				'/repo/packages/ai/src/index.ts': file_summary({ covered: 0, total: 0 }),
			},
		})

		expect(coverage.map(entry => entry.workspace)).toEqual(['apps/editor', 'packages/ai'])
		expect(coverage[0]).toMatchObject({ files: 2, lines: { covered: 4, total: 10 } })
	})
})

describe('tests_by_workspace', () => {
	it('counts test files and tests per workspace', () => {
		const tests = tests_by_workspace({
			root_dir: ROOT,
			results: {
				success: true,
				numTotalTests: 3,
				testResults: [
					{ name: '/repo/apps/editor/src/a.test.ts', assertionResults: [{}, {}] },
					{ name: '/repo/apps/editor/src/b.test.ts', assertionResults: [{}] },
				],
			},
		})

		expect(tests).toEqual([{ workspace: 'apps/editor', test_files: 2, tests: 3 }])
	})
})

describe('percent', () => {
	it('is null when there is nothing to cover', () => {
		expect(percent({ covered: 0, total: 0 })).toBeNull()
		expect(percent({ covered: 1, total: 4 })).toBe(25)
	})
})

describe('format_delta', () => {
	it('shows the change in percentage points with a direction', () => {
		expect(format_delta({ current: { covered: 6, total: 10 }, baseline: { covered: 5, total: 10 } })).toBe('▲ 10.0')
		expect(format_delta({ current: { covered: 4, total: 10 }, baseline: { covered: 5, total: 10 } })).toBe('▼ 10.0')
		expect(format_delta({ current: { covered: 5, total: 10 }, baseline: { covered: 50, total: 100 } })).toBe('±0.0')
	})

	it('is blank without a baseline to compare against', () => {
		expect(format_delta({ current: { covered: 5, total: 10 } })).toBe('')
		expect(format_delta({ current: { covered: 5, total: 10 }, baseline: { covered: 0, total: 0 } })).toBe('')
	})
})

describe('coverage_markdown', () => {
	const coverage = coverage_by_workspace({
		root_dir: ROOT,
		summary: { '/repo/apps/editor/src/a.ts': file_summary({ covered: 3, total: 4 }) },
	})
	const tests = [{ workspace: 'apps/editor', test_files: 1, tests: 2 }]

	it('leaves the delta column out without a baseline', () => {
		const markdown = coverage_markdown({ coverage, tests })
		expect(markdown).toContain('| Workspace | Lines | Statements |')
		expect(markdown).toContain('| `apps/editor` | 75.0% | 75.0% | 75.0% | 75.0% | 2 |')
	})

	it('adds the delta against the baseline it names', () => {
		const baseline = coverage_by_workspace({
			root_dir: ROOT,
			summary: { '/repo/apps/editor/src/a.ts': file_summary({ covered: 2, total: 4 }) },
		})
		const markdown = coverage_markdown({ coverage, tests, baseline, baseline_label: 'main @ abc1234' })
		expect(markdown).toContain('against main @ abc1234')
		expect(markdown).toContain('| `apps/editor` | 75.0% | ▲ 25.0 | 75.0% |')
	})
})
