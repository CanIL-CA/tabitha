// @ts-check
import { defineConfig, devices } from '@playwright/test'

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
		...overrides,
	})
}
