import { m } from '#lib/paraglide/messages.js'
import type { CopilotMode, MttLevel } from '#lib/types.js'

export const MODE_LABELS: Record<CopilotMode, () => string> = {
	brief: m.mode_brief,
	discern: m.mode_discern,
}

export const MTT_LEVEL_LABELS: Record<MttLevel, () => string> = {
	grade5: m.mtt_level_direct,
	high_school: m.mtt_level_detailed,
	undergraduate: m.mtt_level_technical,
}
