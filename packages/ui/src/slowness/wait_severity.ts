export const SLOW_AFTER_MS = 5_000
export const STALLED_AFTER_MS = 20_000

export type WaitSeverity = 'none' | 'slow' | 'stalled'

export function wait_severity(waiting_ms: number | undefined): WaitSeverity {
	if (waiting_ms === undefined || waiting_ms < SLOW_AFTER_MS) return 'none'
	if (waiting_ms < STALLED_AFTER_MS) return 'slow'
	return 'stalled'
}
