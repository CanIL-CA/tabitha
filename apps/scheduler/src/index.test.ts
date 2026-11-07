import { beforeEach, describe, expect, it, vi } from 'vitest'
import scheduler, { type SchedulerEnv } from './index'
import type { Fetcher, ScheduledController } from '@cloudflare/workers-types'

function create_env(response: Response): SchedulerEnv & { ONTOLOGY: { fetch: ReturnType<typeof vi.fn> } } {
	return {
		ONTOLOGY: { fetch: vi.fn(async () => response) } as unknown as Fetcher & { fetch: ReturnType<typeof vi.fn> },
		SCHEDULER_TOKEN: 's3cret',
	}
}

/**
 * Stands in for the deployed ontology app. It copies SvelteKit 3's CSRF guard (`is_csrf_forbidden`,
 * not exported by the package): a POST with no content-type, or a form one, from another origin is
 * refused before the route runs. It also copies Better Auth's dynamic base URL, which every request
 * passes through: a bound request arrives with only the headers its caller set, and without an
 * allowed Host the session lookup throws.
 */
function create_ontology_app(): { app: Fetcher, synced_runs: string[] } {
	const synced_runs: string[] = []
	const self_origin = 'https://ontology.tabitha.bible'
	const form_content_types = ['application/x-www-form-urlencoded', 'multipart/form-data', 'text/plain']

	const fetch = async (...fetch_args: ConstructorParameters<typeof Request>) => {
		const request = new Request(...fetch_args)
		const content_type = request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()
		const looks_like_form = !content_type || form_content_types.includes(content_type)
		if (looks_like_form && request.headers.get('origin') !== self_origin) {
			return new Response(`Cross-site ${request.method} form submissions are forbidden`, { status: 403 })
		}

		if (request.headers.get('host') !== new URL(self_origin).host) {
			return new Response('Dynamic baseURL could not be resolved for this direct auth.api call', { status: 500 })
		}

		if (new URL(request.url).pathname !== '/scheduled/sync') return new Response('Not found', { status: 404 })
		if (request.headers.get('authorization') !== 'Bearer s3cret') return new Response('Unauthorized', { status: 401 })

		synced_runs.push(request.method)
		return Response.json({ complex_terms: 42 })
	}

	return { app: { fetch } as unknown as Fetcher, synced_runs }
}

function run_cron({ cron, env }: { cron: string, env: SchedulerEnv }): Promise<void> {
	return scheduler.scheduled({ cron } as ScheduledController, env)
}

describe('scheduler', () => {
	beforeEach(() => {
		vi.spyOn(console, 'info').mockImplementation(() => {})
		vi.spyOn(console, 'warn').mockImplementation(() => {})
	})

	it("runs ontology's scheduled sync every 12 hours, past SvelteKit's CSRF guard and Better Auth's host check", async () => {
		const { app, synced_runs } = create_ontology_app()

		await run_cron({ cron: '0 */12 * * *', env: { ONTOLOGY: app, SCHEDULER_TOKEN: 's3cret' } })

		expect(synced_runs).toEqual(['POST'])
	})

	it('fails the cron run when the app answers with an error', async () => {
		const env = create_env(new Response('Unauthorized', { status: 401 }))

		await expect(run_cron({ cron: '0 */12 * * *', env })).rejects.toThrow('401')
	})

	it('calls nothing for a cron with no job', async () => {
		const env = create_env(new Response('ok'))

		await run_cron({ cron: '*/5 * * * *', env })

		expect(env.ONTOLOGY.fetch).not.toHaveBeenCalled()
	})
})
