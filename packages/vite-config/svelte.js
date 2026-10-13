// @ts-check
import adapter from '@sveltejs/adapter-cloudflare'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

const POLL_EVERY_30_MINS = 30 * 60 * 1000

/**
 * Creates standardized SvelteKit configuration for Tabitha Cloudflare applications.
 *
 * @param {Object} [options]
 * @param {import('@sveltejs/adapter-cloudflare').AdapterOptions} [options.adapter_options] Cloudflare adapter options
 * @param {Record<string, any>} [options.kit] SvelteKit configuration overrides
 * @param {any} [options.preprocess] Custom preprocessor (defaults to vitePreprocess())
 * @param {Record<string, any>} [options.rest] Additional Svelte configuration options
 * @returns {import('@sveltejs/kit').Config}
 */
export function create_app_svelte_config({
	adapter_options,
	kit = {},
	preprocess = vitePreprocess(),
	...rest
} = {}) {
	return {
		kit: {
			adapter: adapter(adapter_options),
			// Users might leave a tab open indefinitely, so poll for new deployments (see UpdateNotice in @tabitha/ui).
			version: { pollInterval: POLL_EVERY_30_MINS },
			// SvelteKit's generated tsconfig only covers src/ and test(s)/, which left the Playwright
			// specs and their config out of `bun run check`.
			typescript: {
				config: config => ({ ...config, include: [...config.include, '../e2e/**/*.ts', '../playwright.config.js'] }),
			},
			...kit,
		},
		preprocess,
		...rest,
	}
}
