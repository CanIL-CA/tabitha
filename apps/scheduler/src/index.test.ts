import { beforeEach, describe, expect, it, vi } from 'vitest'
import scheduler, { type SchedulerEnv } from './index'
import type { Fetcher, ScheduledController } from '@cloudflare/workers-types'

function create_env(response: Response): SchedulerEnv & { ONTOLOGY: { fetch: ReturnType<typeof vi.fn> } } {
	return {
		ONTOLOGY: { fetch: vi.fn(async () => response) } as unknown as Fetcher & { fetch: ReturnType<typeof vi.fn> },
		SCHEDULER_TOKEN: 's3cret',
	}
}

function run_cron({ cron, env }: { cron: string, env: SchedulerEnv }): Promise<void> {
	return scheduler.scheduled({ cron } as ScheduledController, env)
}

describe('scheduler', () => {
	beforeEach(() => {
		vi.spyOn(console, 'info').mockImplementation(() => {})
		vi.spyOn(console, 'warn').mockImplementation(() => {})
	})

	it('calls ontology\'s scheduled sync with the shared token every 12 hours', async () => {
		const env = create_env(new Response('{"complex_terms":42}'))

		await run_cron({ cron: '0 */12 * * *', env })

		expect(env.ONTOLOGY.fetch).toHaveBeenCalledWith('https://ontology.tabitha.bible/scheduled/sync', {
			method: 'POST',
			headers: { authorization: 'Bearer s3cret' },
		})
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
