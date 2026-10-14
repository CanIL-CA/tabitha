// SvelteKit polls this to set `updated` (see UpdateNotice in @tabitha/ui). A cached answer would hide
// every new deployment, so it always goes to the network. `_app` is SvelteKit's default appDir.
export const VERSION_FILE_PATH = '/_app/version.json'

export const CACHED_AT_HEADER = 'x-tabitha-sw-cached-at'
export const MAX_RUNTIME_ENTRIES = 200
export const MAX_RUNTIME_AGE_MS = 24 * 60 * 60 * 1000

export type Strategy = 'precache' | 'network_first' | 'network_only'

export type RequestSummary = {
	readonly url: string
	readonly method: string
	readonly mode: RequestMode
}

type ChooseStrategyOptions = {
	readonly request: RequestSummary
	readonly scope_origin: string
	readonly precache_paths: ReadonlySet<string>
	readonly network_first_paths: ReadonlySet<string>
}

// `network_only` means the worker leaves the request alone, exactly as if it weren't installed.
export function choose_strategy({ request, scope_origin, precache_paths, network_first_paths }: ChooseStrategyOptions): Strategy {
	if (request.method !== 'GET') return 'network_only'

	// Pages are server-rendered per route, so a full page load always gets the newest HTML. That
	// load is also what picks up a new deployment (UpdateNotice turns the next link into one).
	if (request.mode === 'navigate') return 'network_only'

	const url = new URL(request.url)
	if (url.origin !== scope_origin) return 'network_only'
	if (url.pathname === VERSION_FILE_PATH) return 'network_only'
	if (precache_paths.has(url.pathname)) return 'precache'
	if (network_first_paths.has(url.pathname)) return 'network_first'

	return 'network_only'
}

export function cache_names({ version }: { version: string }) {
	return {
		precache: `precache-${version}`,
		runtime: `runtime-${version}`,
	}
}

type StaleCacheNamesOptions = {
	readonly existing: readonly string[]
	readonly current: readonly string[]
}

// Everything but this deployment's caches, including any left by an earlier service worker.
export function stale_cache_names({ existing, current }: StaleCacheNamesOptions): string[] {
	return existing.filter(name => !current.includes(name))
}

type IsFreshOptions = {
	readonly cached_at: string | null
	readonly now: number
}

export function is_fresh({ cached_at, now }: IsFreshOptions): boolean {
	const stored = Number(cached_at)
	if (!cached_at || !Number.isFinite(stored)) return false

	return now - stored <= MAX_RUNTIME_AGE_MS
}

// Cache keys come back in insertion order, so the oldest entries are the ones past the limit.
export function keys_to_trim<T>({ keys }: { keys: readonly T[] }): T[] {
	return keys.slice(0, Math.max(0, keys.length - MAX_RUNTIME_ENTRIES))
}
