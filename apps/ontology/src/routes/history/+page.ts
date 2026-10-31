import { browser } from '$app/env'
import { check_for_pending_creates } from '#lib/offline/pending.js'
import { APPLIED_CHANGE_FILTERS, parse_change_filters } from '#lib/changes/change_filters.js'
import type { PageLoad } from './$types'

// Concepts added offline live only in this browser's queue, so the server can't have included them
// in `changes`; this universal load adds them once it runs in the browser, right after SSR.
// Spreads `data` back in, since a universal load's return value replaces the server load's.
export async function load({ data, url }: Parameters<PageLoad>[0]) {
	const filters = parse_change_filters({ search_params: url.searchParams, defaults: APPLIED_CHANGE_FILTERS })

	if (!browser) return { ...data, filters }

	return { ...data, filters, changes: [...await check_for_pending_creates(), ...data.changes] }
}
