import { describe, expect, test, vi } from 'vitest'
import { AUTO_RETRY_DELAY_SECONDS, AUTO_RETRY_LIMIT, auto_retry, needs_auto_retry, type AutoRetryStatus } from './auto_retry'
import type { CopilotResult } from '@tabitha/types'

type RunOptions = {
	attempt?: () => Promise<boolean>
	should_stop?: () => boolean
}

async function run({ attempt = async () => false, should_stop = () => false }: RunOptions = {}) {
	const statuses: (AutoRetryStatus | null)[] = []
	const wait_one_second = vi.fn(async () => {})
	await auto_retry({ attempt, should_stop, on_status: status => statuses.push(status), wait_one_second })
	return { statuses, wait_one_second }
}

const waiting_for_first_retry: AutoRetryStatus[] = Array.from({ length: AUTO_RETRY_DELAY_SECONDS }, (_, i) => ({ phase: 'waiting', retry: 1, seconds_left: AUTO_RETRY_DELAY_SECONDS - i }))

describe('auto_retry', () => {
	test('counts down the delay one second at a time before each retry', async () => {
		const attempt = vi.fn(async () => true)
		const { statuses, wait_one_second } = await run({ attempt })

		expect(statuses.slice(0, AUTO_RETRY_DELAY_SECONDS)).toEqual(waiting_for_first_retry)
		expect(wait_one_second).toHaveBeenCalledTimes(AUTO_RETRY_DELAY_SECONDS)
	})

	test('reports the retry as running, then clears the status once it succeeds', async () => {
		const { statuses } = await run({ attempt: async () => true })

		expect(statuses.slice(-2)).toEqual([{ phase: 'retrying', retry: 1 }, null])
	})

	test('stops after the first success without using the remaining retries', async () => {
		const attempt = vi.fn()
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(true)
		const { wait_one_second } = await run({ attempt })

		expect(attempt).toHaveBeenCalledTimes(2)
		expect(wait_one_second).toHaveBeenCalledTimes(2 * AUTO_RETRY_DELAY_SECONDS)
	})

	test('gives up after the retry limit and reports it', async () => {
		const attempt = vi.fn(async () => false)
		const { statuses } = await run({ attempt })

		expect(attempt).toHaveBeenCalledTimes(AUTO_RETRY_LIMIT)
		expect(statuses.at(-1)).toEqual({ phase: 'gave_up' })
		expect(statuses.filter(status => status?.phase === 'retrying').map(status => status!.retry)).toEqual([1, 2, 3])
	})

	test('numbers the countdown by retry', async () => {
		const { statuses } = await run()

		const retries_waited = new Set(statuses.filter(status => status?.phase === 'waiting').map(status => status!.retry))
		expect([...retries_waited]).toEqual([1, 2, 3])
	})

	test('stops without attempting when something else fixed the verse during the countdown', async () => {
		const attempt = vi.fn(async () => true)
		const { statuses, wait_one_second } = await run({ attempt, should_stop: () => true })

		expect(attempt).not.toHaveBeenCalled()
		expect(wait_one_second).toHaveBeenCalledTimes(1)
		expect(statuses.at(-1)).toBeNull()
	})

	test('stops retrying when the result went stale while an attempt was running', async () => {
		let stale = false
		const attempt = vi.fn(async () => {
			stale = true
			return false
		})
		const { statuses } = await run({ attempt, should_stop: () => stale })

		expect(attempt).toHaveBeenCalledTimes(1)
		expect(statuses.at(-1)).toBeNull()
	})
})

describe('needs_auto_retry', () => {
	const verse = { book: 'Luke', chapter: 11, verse: 1 }

	test.each([
		{ name: 'an error nobody classified', result: { type: 'error', verse, error: 'AI Gateway request failed with status 504' } },
		{ name: 'an error marked as worth retrying', result: { type: 'error', verse, error: 'x', retryable: undefined } },
	] satisfies { name: string, result: CopilotResult }[])('retries $name', ({ result }) => {
		expect(needs_auto_retry(result)).toBe(true)
	})

	test('does not retry an error that would fail the same way again', () => {
		expect(needs_auto_retry({ type: 'error', verse, error: 'There is no English text saved yet for this verse.', retryable: false })).toBe(false)
	})

	test('does not retry a verse that has a result, or no result at all', () => {
		expect(needs_auto_retry({ type: 'discern', verse, english_text: 'x', notes: [] })).toBe(false)
		expect(needs_auto_retry(undefined)).toBe(false)
	})
})
