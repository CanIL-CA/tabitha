// @ts-check
import { paraglideVitePlugin } from '@inlang/paraglide-js'
import adapter from '@sveltejs/adapter-cloudflare'
import { sveltekit } from '@sveltejs/kit/vite'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import { PARAGLIDE_OPTIONS } from './paraglide.js'

const POLL_EVERY_30_MINS = 30 * 60 * 1000

// @sveltejs/adapter-cloudflare emulates platform bindings in dev via wrangler's
// getPlatformProxy(), which logs "Using vars/secrets defined in .env..." at wrangler's
// "log" level on every invocation. Quiet that down unless the developer has opted into
// their own WRANGLER_LOG level (e.g. "debug" while diagnosing a bindings issue).
process.env.WRANGLER_LOG ??= 'warn'

/**
 * Creates standardized Vite configuration for Tabitha SvelteKit applications, including the
 * SvelteKit config itself (SvelteKit 3 reads it from the `sveltekit()` plugin, not svelte.config.js).
 *
 * @param {Object} options
 * @param {number} options.port Dedicated local development port
 * @param {boolean} [options.i18n] Compile the app's `project.inlang` messages with Paraglide (see ./paraglide.js)
 * @param {import('@sveltejs/kit/vite').Config} [options.kit] SvelteKit configuration overrides
 * @param {any[]} [options.plugins] Additional Vite plugins
 * @param {Record<string, any>} [options.server] Server configuration overrides
 * @param {Record<string, any>} [options.ssr] SSR configuration overrides
 * @param {Record<string, any>} [options.rest] Additional Vite configuration options
 * @returns {import('vite').UserConfig}
 */
export function create_app_vite_config({
	port,
	i18n,
	kit = {},
	plugins = [],
	server = {},
	ssr = {},
	...rest
}) {
	return defineConfig({
		plugins: [
			tailwindcss(),
			sveltekit({
				adapter: adapter(),
				// Needed for the `<style lang="postcss">` blocks that use Tailwind's @apply.
				preprocess: vitePreprocess(),
				// Users might leave a tab open indefinitely, so poll for new deployments more often
				// than SvelteKit's hourly default (see UpdateNotice in @tabitha/ui).
				version: { pollInterval: POLL_EVERY_30_MINS },
				...kit,
			}),
			...(i18n ? [paraglideVitePlugin(PARAGLIDE_OPTIONS)] : []),
			...plugins,
		],
		server: {
			port,
			strictPort: true,
			...server,
		},
		ssr: {
			noExternal: ['@tabitha/types', '@tabitha/api-client', '@tabitha/ui'],
			...ssr,
		},
		// @ts-ignore - Vitest inline test configuration
		test: {
			include: ['src/**/*.test.ts'],
			environment: 'node',
			alias: {
				'cloudflare:workers': fileURLToPath(new URL('./cloudflare_workers_stub.js', import.meta.url)),
			},
			// Vitest 4+ only reports files a test loaded unless `include` is set; this keeps
			// untested source in the denominator, as Vitest 3's `coverage.all` did
			coverage: {
				include: ['src/**/*.{js,ts,svelte}'],
			},
		},
		...rest,
	})
}
