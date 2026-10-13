import { default_settings } from '#lib/lookups.js'
import type { CopilotRunEvent } from '@tabitha/usage'
import type { CopilotResult } from '@tabitha/types'
import type { CopilotSettings, LanguageProfile } from '#lib/types.js'

const PROFILE_FIELDS = Object.keys(default_settings.language_profile) as (keyof LanguageProfile)[]

// Which language-profile options a translator changed, so we can see which ones ever get used.
export const get_customized_profile_fields = (profile: LanguageProfile): string[] =>
	PROFILE_FIELDS.filter(field => JSON.stringify(profile[field]) !== JSON.stringify(default_settings.language_profile[field]))

type ToCopilotRunEventOptions = {
	readonly caller: string
	readonly run: CopilotRunEvent['run']
	readonly book: string
	readonly settings: CopilotSettings
	readonly verse_count: number
	readonly results: readonly CopilotResult[]
}

export function to_copilot_run_event({ caller, run, book, settings, verse_count, results }: ToCopilotRunEventOptions): CopilotRunEvent {
	const errors = results.filter(result => result.type === 'error')

	return {
		kind: 'copilot_run',
		caller,
		run,
		book,
		mode: settings.mode,
		lwc: settings.lwc,
		mtt_level: settings.mtt_level,
		sensitivity: Number(settings.sensitivity) || 0,
		customized_profile: get_customized_profile_fields(settings.language_profile),
		verse_count,
		error_count: errors.length,
		// a batch's errors vary per verse; a single verse's one reason is worth keeping
		error: run === 'verse' ? errors[0]?.error : undefined,
	}
}
