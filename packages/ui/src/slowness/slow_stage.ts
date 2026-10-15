export const SLOW_AFTER_MS = 5_000
export const STALLED_AFTER_MS = 20_000

export type SlowStage = 'idle' | 'slow' | 'stalled'

export function slow_stage(waiting_ms: number | undefined): SlowStage {
	if (waiting_ms === undefined || waiting_ms < SLOW_AFTER_MS) return 'idle'
	if (waiting_ms < STALLED_AFTER_MS) return 'slow'
	return 'stalled'
}
