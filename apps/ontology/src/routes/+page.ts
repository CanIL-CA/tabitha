import { browser } from '$app/env'
import { merge_pending_changes } from '#lib/offline/pending.js'
import type { PageLoad } from './$types'

// Edits queued offline live only in this browser's IndexedDB, so the server can't have merged them
// into `results`; this universal load does it once it runs in the browser, right after SSR.
// Spreads `data` back in, since a universal load's return value replaces the server load's.
export async function load({ data }: Parameters<PageLoad>[0]) {
	if (!browser) return data

	return { ...data, results: await merge_pending_changes(data.results) }
}
