import { SCHEDULER_TOKEN } from '$app/env/private'
import { error } from '@sveltejs/kit'
import { env } from 'cloudflare:workers'
import { is_scheduler_authorized, run_scheduled_sync } from '#lib/server/scheduled_sync.js'
import type { RequestHandler } from './$types'

/**
 * Called by the `scheduler` Worker's cron through a service binding (ADR 0018) -- SvelteKit's
 * Cloudflare adapter only exposes `fetch`, so a cron can't reach the app any other way.
 */
export async function POST({ request }: Parameters<RequestHandler>[0]) {
	if (!is_scheduler_authorized({ authorization_header: request.headers.get('authorization'), expected_token: SCHEDULER_TOKEN })) {
		throw error(401, 'Unauthorized')
	}

	return Response.json(await run_scheduled_sync(env))
}
