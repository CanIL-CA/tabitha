import { flushSync } from 'svelte'
import { describe, expect, it } from 'vitest'
import { pending_requests, track_pending } from './pending.svelte'

describe('track_pending', () => {
	it('passes the response through', async () => {
		expect(await track_pending(Promise.resolve('data'))).toBe('data')
	})

	it("doesn't rerun the effect that sent the request", async () => {
		let runs = 0
		const requests: Promise<unknown>[] = []

		const cleanup = $effect.root(() => {
			$effect(() => {
				runs++
				requests.push(track_pending(Promise.resolve()))
			})
		})
		flushSync()
		await Promise.all(requests)
		flushSync()
		cleanup()

		expect(runs).toBe(1)
	})

	it('lets code that watches pending requests see one start and finish', async () => {
		const oldest_seen: (number | undefined)[] = []
		let finish = () => {}

		const cleanup = $effect.root(() => {
			$effect(() => {
				oldest_seen.push(pending_requests.oldest)
			})
		})
		flushSync()
		const request = track_pending(new Promise<void>(resolve => finish = resolve))
		flushSync()
		finish()
		await request
		flushSync()
		cleanup()

		expect(oldest_seen).toEqual([undefined, expect.any(Number), undefined])
	})
})
