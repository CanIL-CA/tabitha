// @ts-check
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { test as base, defineConfig, devices } from '@playwright/test'

export { expect } from '@playwright/test'

/** Set by CI's e2e job to record browser coverage for the unit + e2e report (scripts/ci/merge_coverage.ts). */
const COLLECT_COVERAGE = Boolean(process.env.E2E_COVERAGE)

/** Playwright runs from the app's own directory, so this is `apps/<app>/coverage/e2e`. */
const E2E_COVERAGE_DIR = resolve('coverage/e2e')

const INLINE_SOURCE_MAP = /\/\/# sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,([\w+/=]+)\s*$/

/**
 * Ties one script's browser coverage to the files on disk, or returns null for anything that isn't
 * the app's own code or a workspace file (`/@vite/client`, prebundled deps, the page itself).
 *
 * Vite dev serves app files at `/src/…` and everything else at `/@fs/<absolute path>`, and its inline
 * source maps list `sources` relative to that URL. monocart resolves relative `sources` against the
 * working directory instead, so they're made absolute here; it then reports the same paths vitest does.
 *
 * @template {{ url: string, source?: string }} Entry
 * @param {Object} options
 * @param {Entry} options.entry One script from `page.coverage.stopJSCoverage()`
 * @param {string} options.app_dir The app's directory, which Vite serves `/src/…` from
 * @returns {(Entry & { sourceMap?: { sources: string[] } }) | null}
 */
export function entry_on_disk({ entry, app_dir }) {
	const { pathname } = new URL(entry.url)
	const served = decodeURIComponent(pathname)
	const file_path = served.startsWith('/@fs/') ? served.slice('/@fs'.length)
		: served.startsWith('/src/') ? resolve(app_dir, served.slice(1))
			: null
	if (!file_path) return null

	const url = pathToFileURL(file_path).href
	const inline_map = entry.source?.match(INLINE_SOURCE_MAP)?.[1]
	if (!inline_map) return { ...entry, url }

	/** @type {{ sources: string[], sourceRoot?: string }} */
	const source_map = JSON.parse(Buffer.from(inline_map, 'base64').toString('utf-8'))
	const map_dir = resolve(dirname(file_path), source_map.sourceRoot ?? '')
	return { ...entry, url, sourceMap: { ...source_map, sourceRoot: undefined, sources: source_map.sources.map(source => resolve(map_dir, source)) } }
}

export async function e2e_coverage_report() {
	const { CoverageReport } = await import('monocart-coverage-reports')
	return new CoverageReport({ name: 'e2e', outputDir: E2E_COVERAGE_DIR, reports: ['raw'] })
}

/**
 * Playwright's `test`, plus browser coverage for every test that uses `page` when `E2E_COVERAGE` is set.
 * Chromium only; Firefox and WebKit have no coverage API.
 */
export const test = COLLECT_COVERAGE
	? base.extend({
		page: async ({ page }, use) => {
			await page.coverage.startJSCoverage({ resetOnNavigation: false })
			await use(page)
			const app_dir = process.cwd()
			const entries = (await page.coverage.stopJSCoverage()).flatMap(entry => entry_on_disk({ entry, app_dir }) ?? [])
			await (await e2e_coverage_report()).add(entries)
		},
	})
	: base

/**
 * Waits until SvelteKit has hydrated the page, so a click or submit lands on an attached handler
 * instead of silently doing nothing. Replaces `networkidle` waits, which Playwright discourages.
 *
 * SvelteKit's client runtime sets `history.scrollRestoration` to 'manual' in `_start_router()`,
 * right after hydrating (@sveltejs/kit 2.70.3, src/runtime/client/client.js:2656), and resets it
 * to 'auto' on `beforeunload`. That is an undocumented implementation detail, so keep it in this
 * one place. It also flips early when a reload restores a saved scroll position (client.js:395).
 *
 * @param {Object} options
 * @param {import('@playwright/test').Page} options.page
 */
export async function wait_for_hydration({ page }) {
	await page.waitForFunction(() => history.scrollRestoration === 'manual')
}

/**
 * Creates standardized Playwright E2E configuration for Tabitha applications.
 *
 * @param {{ port: number } & import('@playwright/test').PlaywrightTestConfig} options The app's dedicated dev
 * port, plus any Playwright configuration to override the defaults with
 * @returns {import('@playwright/test').PlaywrightTestConfig}
 */
export function create_app_playwright_config({
	port,
	...overrides
}) {
	return defineConfig({
		testDir: 'e2e',
		fullyParallel: false,
		workers: 1,
		reporter: 'list',
		projects: [
			{
				name: 'chromium',
				use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${port}` },
			},
		],
		webServer: {
			// A `dev:e2e` script (falling back to plain `bun run dev` when an app has no e2e-specific
			// setup) rather than `bun run dev` directly, so the root `test:e2e` script (see
			// scripts/ci/run_e2e.ts) can start every app's e2e dev server the same way up front and
			// wait for all of them to be healthy before any test runs -- removing the cross-app
			// startup race where one app's test hits a sibling's port before that sibling is ready.
			command: 'bun run dev:e2e',
			port,
			// Reusing an already-running server is always safe here (it behaves like `bun run dev`
			// would for a standalone single-app run if nothing is running yet), and is required for
			// the orchestrated multi-app run, where the servers are already started externally.
			reuseExistingServer: true,
		},
		...COLLECT_COVERAGE && { globalTeardown: fileURLToPath(new URL('./playwright_coverage_teardown.js', import.meta.url)) },
		...overrides,
	})
}
