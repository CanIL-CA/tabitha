import type { Fetcher, ScheduledController } from '@cloudflare/workers-types'

export type SchedulerEnv = {
	readonly ONTOLOGY: Fetcher
	readonly SCHEDULER_TOKEN: string
}

type Job = (env: SchedulerEnv) => Promise<void>

type CallAppEndpointOptions = {
	readonly app: Fetcher
	readonly url: string
	readonly token: string
}

/**
 * Each cron in wrangler.jsonc's "triggers" runs the job listed here. Jobs only call an app's own
 * endpoint -- the work itself stays in the app (ADR 0018), since SvelteKit's Cloudflare adapter
 * exposes no `scheduled` handler of its own.
 */
export const JOBS_BY_CRON: Record<string, Job> = {
	'0 */12 * * *': env => call_app_endpoint({
		app: env.ONTOLOGY,
		url: 'https://ontology.tabitha.bible/scheduled/sync',
		token: env.SCHEDULER_TOKEN,
	}),
}

export default {
	// Awaited rather than handed to ctx.waitUntil, so a failed job marks the cron run itself as failed.
	async scheduled(controller: ScheduledController, env: SchedulerEnv): Promise<void> {
		const job = JOBS_BY_CRON[controller.cron]
		if (!job) {
			console.warn(`scheduler: no job for cron "${controller.cron}"`)
			return
		}

		await job(env)
	},
}

async function call_app_endpoint({ app, url, token }: CallAppEndpointOptions): Promise<void> {
	// SvelteKit's CSRF guard refuses a POST with no content-type and no same-site Origin as a cross-site
	// form submission, before the endpoint's own token check ever runs.
	const headers = { 'authorization': `Bearer ${token}`, 'content-type': 'application/json' }
	const response = await app.fetch(url, { method: 'POST', headers })
	const body = await response.text()
	if (!response.ok) throw new Error(`scheduler: ${url} failed with ${response.status}: ${body}`)

	console.info(`scheduler: ${url} -> ${body}`)
}
