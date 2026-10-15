import { browser } from '$app/env'
import { check_for_pending_creates } from '#lib/offline/pending.js'
import type { PageLoad } from './$types'

// Concepts added offline live only in this browser's queue, so the server can't have included them
// in `changes`; this universal load adds them once it runs in the browser, right after SSR.
// Spreads `data` back in, since a universal load's return value replaces the server load's.
export async function load({ data }: Parameters<PageLoad>[0]) {
	if (!browser) return data

	return { ...data, changes: [...await check_for_pending_creates(), ...data.changes] }
}
