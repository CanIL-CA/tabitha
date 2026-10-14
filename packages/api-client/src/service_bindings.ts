// A Worker's fetch() to a sibling app's public host leaves through Cloudflare's edge, which shows
// the sibling one shared IP for every user, so they all share its rate limit. A service binding
// calls the sibling directly instead (docs/decisions/0023-cross-app-calls-via-service-bindings.md).

// An app that loads both @cloudflare/workers-types and the DOM types gets a Fetcher whose
// RequestInit and Response don't match the DOM ones, though at runtime they're the same objects.
// Plain `object`s let either Fetcher assign here.
export type ServiceBinding = {
	fetch(input: string, init?: object): Promise<object>
}

export type ServiceRoute = {
	readonly base_url: string
	// Absent where the runtime has no bindings, such as unit tests
	readonly binding?: ServiceBinding
}

type ServiceFetch = (input: string, init?: RequestInit) => Promise<Response>

const fetch_by_origin = new Map<string, ServiceFetch>()

/**
 * Sends every client call to a route's origin through its binding. Called once from an app's
 * hooks.server.ts, so code running in the browser, which has no bindings, keeps calling the
 * public host.
 */
export function use_service_bindings({ routes, disabled = false }: {
	readonly routes: readonly ServiceRoute[]
	// Locally, sibling apps run under `vite dev`, which a binding can't reach
	readonly disabled?: boolean
}): void {
	if (disabled) return

	for (const { base_url, binding } of routes) {
		if (!binding) continue
		fetch_by_origin.set(new URL(base_url).origin, (input, init) => {
			// A bound request arrives with only the headers set here, and a sibling may need Host as a
			// public request would carry it: ontology's Better Auth resolves its base URL from it
			const headers = new Headers(init?.headers)
			headers.set('host', new URL(input).host)
			return binding.fetch(input, { ...init, headers }) as Promise<Response>
		})
	}
}

export function find_service_fetch(base_url: string): ServiceFetch | undefined {
	if (!URL.canParse(base_url)) return undefined
	return fetch_by_origin.get(new URL(base_url).origin)
}
