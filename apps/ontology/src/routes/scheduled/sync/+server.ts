import { env } from '$env/dynamic/private'
import { error } from '@sveltejs/kit'
import { is_scheduler_authorized, run_scheduled_sync } from '#lib/server/scheduled_sync.js'
import type { RequestHandler } from './$types'

/**
 * Called by the `scheduler` Worker's cron through a service binding (ADR 0018) -- SvelteKit's
 * Cloudflare adapter only exposes `fetch`, so a cron can't reach the app any other way.
 */
export async function POST({ request, platform }: Parameters<RequestHandler>[0]) {
	if (!is_scheduler_authorized({ authorization_header: request.headers.get('authorization'), expected_token: env.SCHEDULER_TOKEN })) {
		throw error(401, 'Unauthorized')
	}
	if (!platform) throw error(503, 'Scheduled sync needs the Cloudflare platform bindings')

	return Response.json(await run_scheduled_sync(platform.env))
}
