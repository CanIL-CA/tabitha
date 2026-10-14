import { themes, type Theme } from '@tabitha/ui/themes'
import { to_data_point, type UsageApp, type UsageDataset, type UsageEvent } from './events'

export type * from './events'

type RecordUsageEventOptions = {
	// The app's `env.USAGE` binding; only production declares it (see wrangler.jsonc).
	readonly dataset: UsageDataset | undefined
	readonly app: UsageApp
	readonly event: UsageEvent
}

export function record_usage_event({ dataset, app, event }: RecordUsageEventOptions): void {
	if (!dataset) return

	// Usage tracking must never break the request it's observing.
	try {
		dataset.writeDataPoint(to_data_point({ app, event }))
	} catch (err) {
		console.warn('Failed to record usage event:', err)
	}
}

// Who made an API request: the app's own pages send Sec-Fetch-Site: same-origin; another app's
// pages send their Origin; server-to-server calls (other Workers, scripts) send neither.
export function get_request_caller(request: Request): string {
	if (request.headers.get('sec-fetch-site') === 'same-origin') return 'same-origin'

	const origin = request.headers.get('origin')
	if (!origin) return 'no-origin'

	return URL.canParse(origin) ? new URL(origin).hostname : 'invalid-origin'
}

export const is_theme = (value: unknown): value is Theme => themes.includes(value as Theme)

type HandleThemeReportOptions = {
	readonly request: Request
	readonly dataset: UsageDataset | undefined
	readonly app: UsageApp
}

// The POST /usage/theme handler every app mounts for report_active_theme (./client).
export async function handle_theme_report({ request, dataset, app }: HandleThemeReportOptions): Promise<Response> {
	const { theme } = await request.json().catch(() => ({}))
	if (!is_theme(theme)) return new Response('Unknown theme', { status: 400 })

	record_usage_event({ dataset, app, event: { kind: 'theme', theme } })

	return new Response(null, { status: 204 })
}
