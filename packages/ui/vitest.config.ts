import { svelte } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	// Compiles runes in *.svelte.ts modules and tests
	plugins: [svelte()],
	// Svelte's default export is its server build, where untrack() and flushSync() are no-ops
	resolve: { conditions: ['browser'] },
	test: { environment: './vitest_client_environment.ts' },
})
