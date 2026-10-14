import { browser } from '$app/env'
import type { LayoutLoad } from './$types'

// Resolved once here rather than by every date-displaying component, and only ever from the browser's
// own Intl data -- the server has no way to know the visitor's locale/timezone, so guessing here would
// just be wrong (and, since this is a universal load, it reruns client-side right after SSR anyway).
// Spreads `data` (the sibling +layout.server.ts's return value) back in -- a universal load's return
// value otherwise replaces the server load's for the component, rather than merging with it.
export function load({ data }: Parameters<LayoutLoad>[0]) {
	const locale = browser ? navigator.language : 'en-US'
	const time_zone = browser ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC'

	return { ...data, locale, time_zone }
}
