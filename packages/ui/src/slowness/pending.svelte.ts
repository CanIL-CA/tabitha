import { untrack } from 'svelte'

// Start times of the server requests apps have asked SlowNotice to watch. Navigations are
// watched without this, through SvelteKit's own `navigating`.
class PendingRequests {
	started_at = $state<number[]>([])

	get oldest(): number | undefined {
		return this.started_at.length ? Math.min(...this.started_at) : undefined
	}
}

export const pending_requests = new PendingRequests()

/**
 * Passes `request` through unchanged, letting SlowNotice tell the user if it keeps them waiting.
 * Callers may be inside an $effect, so the bookkeeping is untracked: `push` and `splice` read the
 * array they write, and a caller that came to depend on it would rerun, and refetch, on every request.
 */
export async function track_pending<T>(request: Promise<T>): Promise<T> {
	const started = Date.now()
	untrack(() => pending_requests.started_at.push(started))

	try {
		return await request
	} finally {
		untrack(() => pending_requests.started_at.splice(pending_requests.started_at.indexOf(started), 1))
	}
}
