import { CACHED_AT_HEADER, cache_names, choose_strategy, is_fresh, keys_to_trim, stale_cache_names } from './strategy'

type ServiceWorkerOptions = {
	readonly self: ServiceWorkerGlobalScope
	// SvelteKit's `version` from `$app/env`, the same value `version.json` reports.
	readonly version: string
	// `immutable` and `assets` from `$app/manifest`: the build output and static files, with paths
	// relative to the app's base path.
	readonly precache_files: readonly { path: string }[]
	// Exact same-origin GET paths to answer from the network, falling back to the last response
	// while offline. An allowlist: anything not listed is never cached.
	readonly network_first_paths?: readonly string[]
}

// A new worker takes over as soon as it installs and drops every cache but its own; the page picks up
// the new version on its next navigation (UpdateNotice in @tabitha/ui), never with a forced reload.
export function register_service_worker({ self, version, precache_files, network_first_paths = [] }: ServiceWorkerOptions): void {
	const names = cache_names({ version })
	// The worker is served from the base path, so its scope is where those relative paths start.
	const precache_paths = precache_files.map(file => new URL(file.path, self.registration.scope).pathname)
	const precache = new Set(precache_paths)
	const network_first = new Set(network_first_paths)

	async function install() {
		const cache = await self.caches.open(names.precache)
		await cache.addAll(precache_paths)
		await self.skipWaiting()
	}

	async function activate() {
		const stale = stale_cache_names({ existing: await self.caches.keys(), current: Object.values(names) })
		await Promise.all(stale.map(name => self.caches.delete(name)))
		await self.clients.claim()
	}

	async function from_precache(request: Request) {
		const cache = await self.caches.open(names.precache)
		return await cache.match(new URL(request.url).pathname) ?? fetch(request)
	}

	async function store({ request, response }: { request: Request, response: Response }) {
		const headers = new Headers(response.headers)
		headers.set(CACHED_AT_HEADER, String(Date.now()))

		const cache = await self.caches.open(names.runtime)
		await cache.put(request, new Response(response.body, { status: response.status, statusText: response.statusText, headers }))
		await Promise.all(keys_to_trim({ keys: await cache.keys() }).map(key => cache.delete(key)))
	}

	async function from_network_first(event: FetchEvent) {
		try {
			const response = await fetch(event.request)
			if (response.status === 200) event.waitUntil(store({ request: event.request, response: response.clone() }))
			return response
		} catch (error) {
			const cache = await self.caches.open(names.runtime)
			const cached = await cache.match(event.request)
			if (cached && is_fresh({ cached_at: cached.headers.get(CACHED_AT_HEADER), now: Date.now() })) return cached
			throw error
		}
	}

	self.addEventListener('install', event => event.waitUntil(install()))
	self.addEventListener('activate', event => event.waitUntil(activate()))
	self.addEventListener('fetch', event => {
		const strategy = choose_strategy({
			request: event.request,
			scope_origin: self.location.origin,
			precache_paths: precache,
			network_first_paths: network_first,
		})
		if (strategy === 'precache') event.respondWith(from_precache(event.request))
		if (strategy === 'network_first') event.respondWith(from_network_first(event))
	})
}
