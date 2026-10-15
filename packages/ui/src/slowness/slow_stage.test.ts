import { describe, expect, test } from 'vitest'
import { slow_stage, SLOW_AFTER_MS, STALLED_AFTER_MS } from './slow_stage'

describe('slow_stage', () => {
	test.each([
		['nothing is waiting', undefined, 'idle'],
		['a request just started', 0, 'idle'],
		['a request is one tick short of slow', SLOW_AFTER_MS - 1, 'idle'],
		['a request has just become slow', SLOW_AFTER_MS, 'slow'],
		['a request is one tick short of stalled', STALLED_AFTER_MS - 1, 'slow'],
		['a request has just stalled', STALLED_AFTER_MS, 'stalled'],
		['a request has been waiting a long time', STALLED_AFTER_MS * 10, 'stalled'],
	])('%s', (_situation, waiting_ms, stage) => {
		expect(slow_stage(waiting_ms)).toBe(stage)
	})
})
