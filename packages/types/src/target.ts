import type { PartOfSpeech } from './core'
import type { Reference } from './reference'
import type { SourceFeature } from './source'

//===============
// projects

/**
 * Canonical registry of target-language projects, each backed by its own D1 database (one
 * `DB_Targets_<project>` binding per entry -- see apps/targets/wrangler.jsonc). This is the single
 * source of truth driving route validation, binding resolution, and the migration pipeline's
 * per-project task list; add a new project here first, then provision its database and binding.
 */
export const TARGET_PROJECTS = ['English', 'Swahili', 'Indonesian', 'Tagalog'] as const

export type TargetProject = typeof TARGET_PROJECTS[number]

//===============
// base text API

export type TargetTextResult = {
	reference: Reference
	texts: TargetTextData[]
}

export type TargetTextData = {
	text: string
	audience: string
	ideal?: string
}

//===============
// lookup/features API

export type TargetFeature = SourceFeature

export type TargetFeatureResult = {
	source: TargetFeature[]
	lexical: TargetFeature[]
}

//===============
// lookup/forms API

export type TargetFormResult = {
	id: number
	stem: string
	part_of_speech: PartOfSpeech
	form: string
}
