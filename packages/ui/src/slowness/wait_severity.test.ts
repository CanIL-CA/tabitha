import { describe, expect, test } from 'vitest'
import { wait_severity, SLOW_AFTER_MS, STALLED_AFTER_MS } from './wait_severity'

describe('wait_severity', () => {
	test.each([
		['nothing is waiting', undefined, 'none'],
		['a request just started', 0, 'none'],
		['a request is one tick short of slow', SLOW_AFTER_MS - 1, 'none'],
		['a request has just become slow', SLOW_AFTER_MS, 'slow'],
		['a request is one tick short of stalled', STALLED_AFTER_MS - 1, 'slow'],
		['a request has just stalled', STALLED_AFTER_MS, 'stalled'],
		['a request has been waiting a long time', STALLED_AFTER_MS * 10, 'stalled'],
	])('%s', (_situation, waiting_ms, severity) => {
		expect(wait_severity(waiting_ms)).toBe(severity)
	})
})
