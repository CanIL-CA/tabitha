import app_config from '../vite.config.js'
import type { ViteUserConfig } from 'vitest/config'

const config: ViteUserConfig = app_config

// The app's own config (env modules, ?raw prompts, #lib) pointed at the eval files instead of
// the unit tests. Run through eval/cli.ts, not directly.
export default {
	...config,
	test: {
		...config.test,
		include: ['eval/**/*.eval.ts'],
		// A brief call can take 60-90s during a Vertex slowdown, and the gateway retries up to 3 times.
		testTimeout: 15 * 60 * 1000,
		maxConcurrency: 4,
	},
} satisfies ViteUserConfig
