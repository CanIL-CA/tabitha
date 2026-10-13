import { $ } from 'bun'
import { appendFile } from 'node:fs/promises'

type PackageConfig = {
	name: string
	pkg: string
	dir: string
	/** Package has @vitest/coverage-v8 wired up and can run `vitest --coverage`. */
	hasCoverage: boolean
	/** Package has a `test:unit` script at all (some packages have none, e.g. packages/ui). */
	hasTestScript: boolean
}

type CoverageMetrics = {
	name: string
	pkg: string
	testCount: number
	fileCount: number
	statements: string
	branches: string
	functions: string
	lines: string
	status: string
}

const PACKAGES_TO_COVER: PackageConfig[] = [
	{ name: 'apps/editor (Linguistic Core)', pkg: '@tabitha/editor', dir: 'apps/editor', hasCoverage: true, hasTestScript: true },
	{ name: 'apps/sources (Source Text & Encoding)', pkg: '@tabitha/sources', dir: 'apps/sources', hasCoverage: true, hasTestScript: true },
	{ name: 'apps/ontology (Semantic Concepts)', pkg: '@tabitha/ontology', dir: 'apps/ontology', hasCoverage: true, hasTestScript: true },
	{ name: 'apps/targets (Target Language Forms)', pkg: '@tabitha/targets', dir: 'apps/targets', hasCoverage: true, hasTestScript: true },
	{ name: 'apps/copilot (AI Assist)', pkg: '@tabitha/copilot', dir: 'apps/copilot', hasCoverage: false, hasTestScript: true },
	{ name: 'apps/www (Public Website)', pkg: '@tabitha/www', dir: 'apps/www', hasCoverage: false, hasTestScript: false },
	{ name: 'apps/scheduler (Cron Triggers)', pkg: '@tabitha/scheduler', dir: 'apps/scheduler', hasCoverage: false, hasTestScript: true },
	{ name: 'packages/api-client (Typed SDK)', pkg: '@tabitha/api-client', dir: 'packages/api-client', hasCoverage: true, hasTestScript: true },
	{ name: 'packages/types (Shared Types)', pkg: '@tabitha/types', dir: 'packages/types', hasCoverage: false, hasTestScript: true },
	{ name: 'packages/ui (Component Library)', pkg: '@tabitha/ui', dir: 'packages/ui', hasCoverage: false, hasTestScript: false },
]

async function run_coverage_report() {
	console.log(`
============================================================
       📊 TaBiThA Unit Test Coverage & CI Reporter
============================================================
`)

	const is_ci = process.env.GITHUB_ACTIONS === 'true'
	const summary_file = process.env.GITHUB_STEP_SUMMARY

	// 1. Run unit tests across the monorepo
	console.log('🧪 Executing workspace unit test suites...')
	const test_proc = await $`bun run test:unit`
	if (test_proc.exitCode !== 0) {
		console.error('❌ Unit tests failed.')
		process.exit(test_proc.exitCode)
	}

	console.log('\n✅ All unit tests passed cleanly across workspace!\n')

	// 2. Generate coverage breakdown for all active packages, reading real counts
	//    out of each vitest run rather than trusting stale, hand-maintained numbers.
	console.log('📊 Calculating code coverage metrics via v8 for all packages...')
	const results: CoverageMetrics[] = []

	for (const p of PACKAGES_TO_COVER) {
		if (!p.hasTestScript) {
			results.push({
				name: p.name,
				pkg: p.pkg,
				fileCount: 0,
				testCount: 0,
				statements: 'N/A',
				branches: 'N/A',
				functions: 'N/A',
				lines: 'N/A',
				status: '⚪ No test script',
			})
			continue
		}

		try {
			// `coverage.include` counts untested files too (Vitest 3's `coverage.all`); packages
			// without a Vite config wouldn't get it from @tabitha/vite-config
			const vitest_args = p.hasCoverage
				? ['--coverage', '--coverage.reporter=text-summary', '--coverage.include=src/**/*.{js,ts,svelte}']
				: []
			const cov_proc = await $`cd ${p.dir} && bunx vitest run src --passWithNoTests ${vitest_args}`.quiet()
			const output = cov_proc.text()

			const file_match = output.match(/Test Files\s+.*\((\d+)\)/)
			const tests_match = output.match(/Tests\s+.*\((\d+)\)/)
			const fileCount = file_match ? Number(file_match[1]) : 0
			const testCount = tests_match ? Number(tests_match[1]) : 0

			if (fileCount === 0) {
				results.push({
					name: p.name,
					pkg: p.pkg,
					fileCount: 0,
					testCount: 0,
					statements: 'N/A',
					branches: 'N/A',
					functions: 'N/A',
					lines: 'N/A',
					status: '🟡 No test files found',
				})
				continue
			}

			if (!p.hasCoverage) {
				results.push({
					name: p.name,
					pkg: p.pkg,
					fileCount,
					testCount,
					statements: 'N/A',
					branches: 'N/A',
					functions: 'N/A',
					lines: 'N/A',
					status: '🟢 Passing (no coverage config)',
				})
				continue
			}

			const stmts_match = output.match(/Statements\s*:\s*([0-9.]+%)/)
			const branch_match = output.match(/Branches\s*:\s*([0-9.]+%)/)
			const funcs_match = output.match(/Functions\s*:\s*([0-9.]+%)/)
			const lines_match = output.match(/Lines\s*:\s*([0-9.]+%)/)

			if (stmts_match && lines_match) {
				results.push({
					name: p.name,
					pkg: p.pkg,
					fileCount,
					testCount,
					statements: stmts_match[1],
					branches: branch_match ? branch_match[1] : 'N/A',
					functions: funcs_match ? funcs_match[1] : 'N/A',
					lines: lines_match[1],
					status: '🟢 Passing',
				})
			} else {
				results.push({
					name: p.name,
					pkg: p.pkg,
					fileCount,
					testCount,
					statements: 'N/A',
					branches: 'N/A',
					functions: 'N/A',
					lines: 'N/A',
					status: '⚠️ Coverage unavailable',
				})
			}
		} catch (err: unknown) {
			console.warn(`⚠️  Could not extract coverage for ${p.pkg}:`, err)
			results.push({
				name: p.name,
				pkg: p.pkg,
				fileCount: 0,
				testCount: 0,
				statements: 'N/A',
				branches: 'N/A',
				functions: 'N/A',
				lines: 'N/A',
				status: '🔴 Run failed',
			})
		}
	}

	// 3. Print coverage summary table to console log
	if (results.length > 0) {
		console.log('\n============================= Coverage Summary =============================')
		console.log('Package / App                          | Lines   | Stmts   | Branch  | Funcs')
		console.log('---------------------------------------|---------|---------|---------|-------')
		for (const r of results) {
			const name = r.name.padEnd(38, ' ')
			const lines = r.lines.padEnd(7, ' ')
			const stmts = r.statements.padEnd(7, ' ')
			const branches = r.branches.padEnd(7, ' ')
			const funcs = r.functions.padEnd(7, ' ')
			console.log(`${name} | ${lines} | ${stmts} | ${branches} | ${funcs}`)
		}
		console.log('============================================================================\n')
	}

	// 4. Output to GitHub Step Summary if running in CI
	if (is_ci && summary_file) {
		const total_tests = results.reduce((acc, r) => acc + r.testCount, 0)
		const total_files = results.reduce((acc, r) => acc + r.fileCount, 0)

		let markdown = '## 📊 Test Suite & Code Coverage Summary\n\n'
		markdown += `✨ **${total_tests} Unit Tests Executed across ${total_files} Test Suites**\n\n`

		markdown += '### 📈 Code Coverage Metrics\n\n'
		markdown += '| Subsystem / Package | Statements | Branches | Functions | Lines | Status |\n'
		markdown += '| :--- | :--- | :--- | :--- | :--- | :--- |\n'
		for (const r of results) {
			markdown += `| **${r.name}** | \`${r.statements}\` | \`${r.branches}\` | \`${r.functions}\` | \`${r.lines}\` | ${r.status} |\n`
		}
		markdown += '\n'

		markdown += '### 🧪 Test Suite Breakdown\n\n'
		markdown += '| Workspace Test Suite | Test Files | Total Tests | Status |\n'
		markdown += '| :--- | :--- | :--- | :--- |\n'
		for (const r of results) {
			markdown += `| **${r.pkg}** | ${r.fileCount} files | ${r.testCount} tests | ${r.status} |\n`
		}
		markdown += '\n'
		markdown += '> Pure in-memory unit tests with zero network or database dependencies.\n'

		await appendFile(summary_file, markdown, 'utf-8')
		console.log('📝 Published full coverage dashboard to GitHub Step Summary.')
	}
}

if (import.meta.main) {
	await run_coverage_report()
}
