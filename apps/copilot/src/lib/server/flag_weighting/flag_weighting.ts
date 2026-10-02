import { default_flag_weights_for_discern, default_flag_weights_for_brief } from './default_flag_weights'
import type { FlagWeightingMap, CopilotNoteSettings, LanguageProfile } from '$lib/types'
import type { CopilotEncodingFlag } from '@tabitha/types/copilot'


export function assign_flag_weights({ flags, settings }: { flags: CopilotEncodingFlag[], settings: CopilotNoteSettings }): CopilotEncodingFlag[] {
	const default_weights = settings.mode === 'discern' ? default_flag_weights_for_discern : default_flag_weights_for_brief
	const profile_weights = get_profile_weights(settings.language_profile)
	return flags.map(flag => assign_flag_weight({ flag, profile_weights, default_weights }))
}

function assign_flag_weight({ flag, profile_weights, default_weights }: { flag: CopilotEncodingFlag, profile_weights: FlagWeightingMap, default_weights: FlagWeightingMap }): CopilotEncodingFlag {
	const weight = get_flag_weight({ flag, weights: profile_weights }) ?? get_flag_weight({ flag, weights: default_weights }) ?? 0
	return { ...flag, weight }
}

function get_flag_weight({ flag, weights }: { flag: CopilotEncodingFlag, weights: FlagWeightingMap }): number | undefined {
	const flag_weights = weights[flag.name]
	if (!flag_weights) {
		return undefined
	}
	const weight = flag_weights[flag.value]
	return weight ?? flag_weights['*']
}

function get_profile_weights(profile: LanguageProfile): FlagWeightingMap {
	const weights: FlagWeightingMap = {}

	if (profile.multiple_past) {
		weights['Verb Time'] = {
			'Immediate Past': 3,
			'Earlier Today': 4,
			'Yesterday': 4,
			'2 Days Ago': 4,
			'3 Days Ago': 4,
			'A Week Ago': 4,
			'A Month Ago': 4,
			'A Year Ago': 4,
			"During Speaker's Lifetime": 4,
		}
	}
	if (profile.multiple_future) {
		weights['Verb Time'] = {
			...weights['Verb Time'] ?? {},
			'Later Today': 4,
			'Tomorrow': 4,
			'2 Days from Now': 4,
			'3 Days from Now': 4,
			'A Week from Now': 4,
			'A Month from Now': 4,
			'A Year from Now': 4,
			"During Speaker's Lifetime (future)": 4,
		}
	}

	if (profile.noun_number.length > 0) {
		weights['Noun Number'] = Object.fromEntries(profile.noun_number.map(value => [value, 5]))
	}

	if (profile.noun_proximity.length > 0) {
		weights['Noun Proximity'] = Object.fromEntries(profile.noun_proximity.flat().map(value => [value, 5]))
	}

	if (profile.noun_clusivity) {
		weights['Noun Person'] = {
			'First Inclusive': 3,
			'First Exclusive': 5,
		}
	}

	if (profile.modifier_degree.length > 0) {
		weights['Adjective Degree'] = Object.fromEntries(profile.modifier_degree.flat().map(value => [value, 5]))
	}

	if (profile.passive !== 'agent_allowed') {
		weights['Agent of Passive'] = {
			'person-A': 1,
			'God-A': 1,
			'Yahweh-A': 1,
			'*': 5,
		}
	}
	if (!profile.rhetorical_questions) {
		weights['Rhetorical Question'] = {
			'Equivalent Statement': 5,
		}
	}
	if (profile.honorifics) {
		// TODO let the profile pick the Speaker and Listener values it cares about
		// It's usually obvious when God is speaking or being spoken to, and the resulting notes don't seem as useful
		weights['Speaker'] = {
			'God': 0,
			'Man': 1,
			'*': 4,
		}
		weights['Listener'] = {
			'God': 0,
			'Man': 1,
			'Crowd': 2,
			'*': 4,
		}
		weights['Speaker-Listener Age'] = {
			'Older - Different Generation': 5,
			'Older - Same Generation': 4,
			'Essentially the Same Age': 3,
			'Younger - Different Generation': 4,
			'Younger - Same Generation': 5,
		}
	}
	if (profile.speech_formula_position !== 'before') {
		weights['Opening Quotation Frame'] = {
			'*': 1,
		}
		weights['Closing Quotation Frame'] = {
			'*': 5,
		}
	}

	for (const [flag, value_weights] of Object.entries(profile.custom_weights ?? {})) {
		weights[flag] = value_weights
	}

	return weights
}