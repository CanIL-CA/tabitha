import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { enqueue, sync_pending } from './sync'
import type { QueuedMutation } from './queue'
import type { ConceptUpdateData } from '#lib/types.js'

// IndexedDB is the storage boundary, so the queue is faked in memory with the same behavior
const queue = vi.hoisted(() => {
	const store = new Map<string, QueuedMutation>()
	let next_id = 0
	return {
		store,
		reset: () => {
			store.clear()
			next_id = 0
		},
		add_mutation: async ({ action, body }: Pick<QueuedMutation, 'action' | 'body'>): Promise<QueuedMutation> => {
			const mutation: QueuedMutation = { client_id: `id-${next_id++}`, action, body, status: 'pending', retry_count: 0 }
			store.set(mutation.client_id, mutation)
			return mutation
		},
		get_pending_mutations: async () => [...store.values()].filter(mutation => mutation.status === 'pending'),
		update_mutation: async ({ client_id, changes }: { client_id: string, changes: Partial<QueuedMutation> }) => {
			const existing = store.get(client_id)
			if (existing) store.set(client_id, { ...existing, ...changes })
		},
		delete_mutation: async (client_id: string) => {
			store.delete(client_id)
		},
	}
})

vi.mock('./queue', () => ({
	add_mutation: queue.add_mutation,
	get_pending_mutations: queue.get_pending_mutations,
	update_mutation: queue.update_mutation,
	delete_mutation: queue.delete_mutation,
}))

const BODY: ConceptUpdateData = {
	stem: 'love',
	sense: 'A',
	part_of_speech: 'Verb',
	level: '2',
	gloss: 'to feel affection',
	brief_gloss: 'feel affection',
	categories: [],
	curated_examples: '',
}

type Reply = Response | Error

// The network is the other boundary: each call to the fake server takes the next scripted reply
function fake_server(replies: Reply[]) {
	const requests: { url: string, body: unknown }[] = []
	vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
		requests.push({ url, body: JSON.parse(init.body as string) })
		const reply = replies.shift()
		if (!reply) throw new Error('unexpected request')
		if (reply instanceof Error) throw reply
		return reply
	})
	return requests
}

const offline = () => new TypeError('Failed to fetch')

function json_response({ body, status = 200 }: { body: unknown, status?: number }): Response {
	return new Response(JSON.stringify(body), { status })
}

async function queued({ action = 'update' }: { action?: QueuedMutation['action'] } = {}): Promise<QueuedMutation> {
	return queue.add_mutation({ action, body: BODY })
}

describe('offline sync', () => {
	beforeEach(() => {
		queue.reset()
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	describe('sync_pending', () => {
		it('has nothing to report when the queue is empty', async () => {
			const requests = fake_server([])

			expect((await sync_pending()).size).toBe(0)
			expect(requests).toEqual([])
		})

		it('sends an update to the update route with its body, then removes it from the queue', async () => {
			const mutation = await queued({ action: 'update' })
			const requests = fake_server([json_response({ body: { applied: true } })])

			const outcomes = await sync_pending()

			expect(requests).toEqual([{ url: '/protected/concept/update/submit', body: BODY }])
			expect(outcomes.get(mutation.client_id)).toEqual({ type: 'synced', applied: true })
			expect(queue.store.size).toBe(0)
		})

		it('sends a create to the create route and reports a suggestion as not applied', async () => {
			const mutation = await queued({ action: 'create' })
			const requests = fake_server([json_response({ body: { applied: false } })])

			const outcomes = await sync_pending()

			expect(requests[0].url).toBe('/protected/concept/create/submit')
			expect(outcomes.get(mutation.client_id)).toEqual({ type: 'synced', applied: false })
		})

		it('keeps a rejected mutation as failed, with the server\'s message', async () => {
			const mutation = await queued()
			fake_server([json_response({ body: { message: 'Gloss is required' }, status: 400 })])

			const outcomes = await sync_pending()

			expect(outcomes.get(mutation.client_id)).toEqual({ type: 'failed', message: 'Gloss is required' })
			expect(queue.store.get(mutation.client_id)).toMatchObject({ status: 'failed', failure_reason: 'Gloss is required' })
		})

		it('uses a default message when the failure body is not JSON', async () => {
			const mutation = await queued()
			fake_server([new Response('<html>Bad gateway</html>', { status: 502 })])

			const outcomes = await sync_pending()

			expect(outcomes.get(mutation.client_id)).toEqual({ type: 'failed', message: 'Failed to sync this change.' })
		})

		it('does not retry a failed mutation on the next flush', async () => {
			await queued()
			fake_server([json_response({ body: { message: 'No' }, status: 400 })])
			await sync_pending()
			const requests = fake_server([])

			expect((await sync_pending()).size).toBe(0)
			expect(requests).toEqual([])
		})

		it('carries on to the next mutation after one fails', async () => {
			const first = await queued()
			const second = await queued()
			fake_server([json_response({ body: { message: 'No' }, status: 400 }), json_response({ body: { applied: true } })])

			const outcomes = await sync_pending()

			expect(outcomes.get(first.client_id)?.type).toBe('failed')
			expect(outcomes.get(second.client_id)).toEqual({ type: 'synced', applied: true })
		})

		it('stops at the first network failure, leaving everything queued for the next flush', async () => {
			const first = await queued()
			const second = await queued()
			fake_server([offline()])

			const outcomes = await sync_pending()

			expect(outcomes.get(first.client_id)).toEqual({ type: 'still_pending' })
			expect(outcomes.has(second.client_id)).toBe(false)
			expect(queue.store.get(first.client_id)).toMatchObject({ status: 'pending', retry_count: 1 })
			expect(queue.store.get(second.client_id)).toMatchObject({ status: 'pending', retry_count: 0 })
		})

		it('syncs what was left over once the network is back', async () => {
			const mutation = await queued()
			fake_server([offline()])
			await sync_pending()
			fake_server([json_response({ body: { applied: true } })])

			const outcomes = await sync_pending()

			expect(outcomes.get(mutation.client_id)).toEqual({ type: 'synced', applied: true })
			expect(queue.store.size).toBe(0)
		})

		it('does nothing when a flush is already running', async () => {
			await queued()
			let release: (res: Response) => void = () => undefined
			const request_sent = new Promise<void>(resolve => {
				vi.stubGlobal('fetch', () => new Promise<Response>(release_response => {
					release = release_response
					resolve()
				}))
			})

			const first = sync_pending()
			await request_sent
			const second = await sync_pending()
			release(json_response({ body: { applied: true } }))

			expect(second.size).toBe(0)
			expect((await first).size).toBe(1)
		})
	})

	describe('enqueue', () => {
		it('returns the outcome of the mutation it queued, even behind an older one', async () => {
			await queued()
			fake_server([json_response({ body: { applied: false } }), json_response({ body: { applied: true } })])

			expect(await enqueue({ action: 'update', body: BODY })).toEqual({ type: 'synced', applied: true })
		})

		it('reports still pending, and keeps the mutation queued, when offline', async () => {
			fake_server([offline()])

			expect(await enqueue({ action: 'create', body: BODY })).toEqual({ type: 'still_pending' })
			expect(queue.store.size).toBe(1)
		})

		it('reports still pending when an older mutation blocked the flush', async () => {
			await queued()
			fake_server([offline()])

			expect(await enqueue({ action: 'update', body: BODY })).toEqual({ type: 'still_pending' })
			expect(queue.store.size).toBe(2)
		})
	})
})
