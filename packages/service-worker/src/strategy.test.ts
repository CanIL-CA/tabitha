import { describe, expect, it } from 'vitest'
import { MAX_RUNTIME_AGE_MS, MAX_RUNTIME_ENTRIES, VERSION_FILE_PATH, cache_names, choose_strategy, is_fresh, keys_to_trim, stale_cache_names, type RequestSummary } from './strategy'

const ORIGIN = 'https://ontology.tabitha.bible'

function strategy_for({ path, method = 'GET', mode = 'cors', origin = ORIGIN }: { path: string, method?: string, mode?: RequestMode, origin?: string }) {
	const request: RequestSummary = { url: `${origin}${path}`, method, mode }
	return choose_strategy({
		request,
		scope_origin: ORIGIN,
		precache_paths: new Set(['/_app/immutable/entry/start.js', '/favicon.svg']),
		network_first_paths: new Set(['/examples']),
	})
}

describe('choose_strategy', () => {
	it('serves precached build output and static files from the cache', () => {
		expect(strategy_for({ path: '/_app/immutable/entry/start.js' })).toBe('precache')
		expect(strategy_for({ path: '/favicon.svg' })).toBe('precache')
	})

	it('answers an allowlisted GET path network-first, whatever its query', () => {
		expect(strategy_for({ path: '/examples?sense=love-A' })).toBe('network_first')
	})

	it('never handles the version file, even if it were in the precache list', () => {
		const request: RequestSummary = { url: `${ORIGIN}${VERSION_FILE_PATH}`, method: 'GET', mode: 'cors' }
		const strategy = choose_strategy({
			request,
			scope_origin: ORIGIN,
			precache_paths: new Set([VERSION_FILE_PATH]),
			network_first_paths: new Set([VERSION_FILE_PATH]),
		})
		expect(strategy).toBe('network_only')
	})

	it('never handles a page load, so it always gets the newest HTML', () => {
		expect(strategy_for({ path: '/examples', mode: 'navigate' })).toBe('network_only')
		expect(strategy_for({ path: '/favicon.svg', mode: 'navigate' })).toBe('network_only')
	})

	it('leaves anything but GET alone', () => {
		expect(strategy_for({ path: '/examples', method: 'POST' })).toBe('network_only')
	})

	it('leaves other origins alone, even on a listed path', () => {
		expect(strategy_for({ path: '/examples', origin: 'https://targets.tabitha.bible' })).toBe('network_only')
	})

	it('leaves any path not on the allowlist alone, so signed-in routes are never cached', () => {
		expect(strategy_for({ path: '/protected/concept/create/next-sense' })).toBe('network_only')
		expect(strategy_for({ path: '/auth/get-session' })).toBe('network_only')
		expect(strategy_for({ path: '/examples/more' })).toBe('network_only')
	})
})

describe('stale_cache_names', () => {
	it("drops every cache but the current deployment's, including an earlier worker's", () => {
		const current = Object.values(cache_names({ version: '2' }))
		const existing = ['precache-1', 'runtime-1', 'precache-2', 'runtime-2', 'workbox-precache-v2-https://ontology.tabitha.bible/', 'ontology-examples-api']

		expect(stale_cache_names({ existing, current })).toEqual(['precache-1', 'runtime-1', 'workbox-precache-v2-https://ontology.tabitha.bible/', 'ontology-examples-api'])
	})
})

describe('is_fresh', () => {
	const now = 1_000_000_000_000

	it('keeps a response cached within the last day', () => {
		expect(is_fresh({ cached_at: String(now - MAX_RUNTIME_AGE_MS), now })).toBe(true)
	})

	it('expires a response cached more than a day ago', () => {
		expect(is_fresh({ cached_at: String(now - MAX_RUNTIME_AGE_MS - 1), now })).toBe(false)
	})

	it('treats a response without a usable timestamp as expired', () => {
		expect(is_fresh({ cached_at: null, now })).toBe(false)
		expect(is_fresh({ cached_at: 'yesterday', now })).toBe(false)
	})
})

describe('keys_to_trim', () => {
	it('keeps everything up to the limit', () => {
		expect(keys_to_trim({ keys: Array.from({ length: MAX_RUNTIME_ENTRIES }, (_, index) => index) })).toEqual([])
	})

	it('drops the oldest entries past the limit', () => {
		expect(keys_to_trim({ keys: Array.from({ length: MAX_RUNTIME_ENTRIES + 2 }, (_, index) => index) })).toEqual([0, 1])
	})
})
