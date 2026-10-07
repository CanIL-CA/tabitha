import type { TriggerDataForLlm, TriggerIdData, LanguageProfile } from '$lib/types'
import type { CopilotEncodingFlag } from '@tabitha/types/copilot'

type TriggerTemplate = {
	name: string
	flags: string[]
	weight_calculator: (flags: CopilotEncodingFlag[], language_profile: LanguageProfile) => number
	flag_key?: (flag: CopilotEncodingFlag) => string
	flag_grouper?: (flags: CopilotEncodingFlag[]) => CopilotEncodingFlag[][]
	trigger_grouper?: (trigger: TriggerDataForLlm) => string
	prompt?: string | ((flags: CopilotEncodingFlag[], language_profile: LanguageProfile) => string)
}

const triggers: TriggerTemplate[] = [
	{
		name: 'TAMP',
		flags: ['Verb Time', 'Verb Aspect', 'Verb Mood', 'Verb Polarity'],
		weight_calculator: flags => {
			if (flags.length === 1 && flags[0].value === 'Negative') {
				return 0
			}
			return power_sum(flags)
		},
		prompt: flags => {
			let prompt_parts: string[] = []

			if (flags.some(f => f.name === 'Verb Time')) {
				prompt_parts.push('For the meaning, describe the Time value. Do not just say "past" or "future", as there are multiple possible levels.')
			}

			const value_prompt_map: Record<string, string> = {
				'Historic Past': '"Historic Past" means it happened at some recorded point in history.',
				'Eternity Past': '"Eternity Past" means it was done before the world was even created.',
				'Unknown Past': '"Unknown Past" means it happened at some unknown or unspecified time in the past.',
				'Unknown Future': '"Unknown Future" means it will happen at some unknown or unspecified time in the future.',
			}
			prompt_parts.push(...flags.map(f => value_prompt_map[f.value]).filter(Boolean))
			prompt_parts.push('For the check, write that they should consider if their translation uses an appropriate tense or verb form. Do not repeat the meaning.')

			return prompt_parts.join(' ')
		},
	},
	{
		name: 'Noun Person',
		flags: ['Noun Person'],
		weight_calculator: flags => flags[0].weight,
		trigger_grouper: t => `${t.flags[0].encoding_anchor['noun_index']}-${t.flags[0].value}`,
		prompt: (flags, profile) => {
			const prompt = []
			const person = flags[0].value
			
			if (person.includes('Inclusive')) {
				if (profile.noun_clusivity) {
					prompt.push(`First Inclusive means that the reader/listener is included when the writer/speaker says "we/us".
						DO NOT say "if your language has an inclusive/exclusive distinction".`)
				} else {
					prompt.push('Ignore the "Inclusive" part and treat it as simple First person plural (we/us).')
				}
			} else if (person.includes('Exclusive')) {
				if (profile.noun_clusivity) {
					prompt.push(`First Exclusive means that the reader/listener is NOT included when the writer/speaker says "we/us".
						DO NOT say "if your language has an inclusive/exclusive distinction".`)
				} else {
					prompt.push('Ignore the "Exclusive" part and treat it as simple First person plural (we/us).')
				}
			}

			if (['First as Third', 'First Inclusive as Third', 'First Exclusive as Third'].includes(person)) {
				prompt.push(`First as Third means the speaker is referring to themselves in the third person, something like "be kind to [your servant]", meaning "be kind to me/us".
					Write a note saying when they say {noun} they are referring to themselves.
					For the check, they should consider how they want to express that in their translation.`)
			} else if (person === 'Second as Third') {
				prompt.push(`Second as Third means the speaker is referring to the listener in the third person, something like "[the king] is being kind to me", meaning "you are being kind to me".
					Write a note saying that when they say {noun} they are referring to who they are talking to.
					For the check, they should consider how they want to express that in their translation.`)
			}

			return prompt.join('\n')
		},
	},
	{
		name: 'Noun Number',
		flags: ['Noun Number'],
		weight_calculator: flags => flags[0].weight,
		trigger_grouper: t => `${t.flags[0].encoding_anchor['noun_index']}-${t.flags[0].value}`,
	},
	{
		name: 'Noun Proximity',
		flags: ['Noun Proximity'],
		weight_calculator: flags => flags[0].weight,
		trigger_grouper: t => `${t.flags[0].encoding_anchor['noun_index']}-${t.flags[0].value}`,
		prompt: (flags, profile) => contrasting_value_prompt({ value: flags[0].value, groupings: profile.noun_proximity }) ?? '',
	},
	{
		name: 'Noun Emphasis/Focus',
		flags: ['Noun Participant Status'],
		weight_calculator: flags => flags[0].weight,
		trigger_grouper: t => `${t.flags[0].encoding_anchor['noun_index']}-${t.flags[0].value}`,
		prompt: flags => {
			if (flags[0].value === 'Significant Location' || flags[0].value === 'Significant Time') {
				return 'In your note, mention that the phrase with {noun} (eg. "in the morning") may need to be emphasized in some way.'
			} else {
				return 'In your note, mention that {noun} may need to be emphasized in some way.'
			}
		},
	},
	{
		name: 'Modifier Degree',
		flags: ['Modifier Degree'],
		weight_calculator: flags => flags[0].weight,
		trigger_grouper: t => `${t.flags[0].encoding_anchor['concept']}-${t.flags[0].value}`,
		prompt: (flags, profile) => {
			const degree = flags[0].value
			const contrasting_prompt = contrasting_value_prompt({ value: degree, groupings: profile.modifier_degree })
			if (contrasting_prompt) {
				return contrasting_prompt
			} else if (degree === "'too'") {
				return 'In your note, mention how there is a negative sense of excess, not just a lot.'
			}
			return ''
		},
	},
	{
		name: 'Social Dynamic',
		flags: ['Speaker', 'Listener', 'Speaker-Listener Age'],
		// TODO The weights should be more about the speaker-listener pair
		weight_calculator: flags => flags.length > 1 ? power_sum(flags) : 0,
		trigger_grouper: t => t.flags.map(f => `${f.name}-${f.value}`).join(';'),
		prompt: flags => {
			if (flags.some(f => f.value === 'Crowd')) {
				return "Don't include anything about the 'Speaker-Listener Age' in your note."
			}
			if (flags.some(f => f.name === 'Speaker-Listener Age')) {
				return "Speaker-Listener Age refers to the speaker's age relative to the listener's age. It is usually an estimate and cannot be strongly stated, so write your note accordingly."
			}
			return ''
		},
	},
	{
		name: 'Speaker Attitude',
		flags: ['Speaker Attitude'],
		weight_calculator: flags => flags[0].weight,
		trigger_grouper: t => t.flags[0].value,
	},
	{
		name: 'Intent/Result',
		flags: ['Intent/Result'],
		weight_calculator: flags => flags[0].weight,
		trigger_grouper: t => `${t.flags[0].encoding_anchor['event'] || ''}-${t.flags[0].value}`,
		prompt: `The possible values are 'Intent', 'Logical Consequence', 'Simple Result'.
		For the meaning, contrast the provided value with one of the other possible values which it could be conflated with.`,
	},
	{
		name: 'Means/Reason',
		flags: ['Means/Reason'],
		weight_calculator: flags => flags[0].weight,
		trigger_grouper: t => `${t.flags[0].encoding_anchor['means_or_reason'] || ''}-${t.flags[0].value}`,
		prompt: `The possible values are 'Reason' (eg. because) and 'Means' (eg. by or through).
		For the meaning, contrast the provided value with the other possible value.`,
	},
	{
		name: 'Explanation of Name',
		flags: ['Explanation of Name'],
		weight_calculator: flags => flags[0].weight,
		trigger_grouper: t => t.flags[0].value,
		prompt: `For the meaning, write something like "This is the first time {proper_name} is mentioned in this book, and {proper_name} is a {label}.
		For the check, write something like "Consider making this clear in your translation or include a footnote."`,
	},
	{
		name: 'Metonymy',
		flags: ['Metonymy'],
		weight_calculator: flags => flags[0].weight,
		trigger_grouper: t => t.flags[0].value,
		prompt: flags => {
			const meaning_prompt = flags[0].encoding_anchor['metonymy_type']?.startsWith('Dynamic')
				? 'For the meaning, explain that the original text simply contains {whole}, but can be understood as {part} {whole}.'
				: 'For the meaning, explain that the original text contains {part} {whole}, but can be understood simply as {whole}.'
			return `${meaning_prompt} For the check, write something like "Consider which way is clearer in your language."`
		},
	},
	{
		name: 'Metaphor',
		flags: ['Metaphor'],
		weight_calculator: flags => flags[0].weight,
		trigger_grouper: t => `${t.flags[0].encoding_anchor['subject']}->${t.flags[0].encoding_anchor['state']}`,
	},
	{
		name: 'Rhetorical Question',
		flags: ['Rhetorical Question'],
		weight_calculator: flags => flags[0].weight,
		// A rhetorical question and equivalent statement are always in adjacent clauses
		flag_key: f => f.encoding_anchor['node_id'].lastIndexOf('.') >= 0 ? f.encoding_anchor['node_id'].slice(0, f.encoding_anchor['node_id'].lastIndexOf('.')) : '',
		prompt: flags => {
			if (flags.some(f => f.value === 'Equivalent Statement')) {
				return `Explain that this is a rhetorical question, explain the type and expected answer, and that it can instead be understood or worded as the {equivalent statement}.
				Convert the encoding of the equivalent statement into readable, grammatical text in the output language, as part of the 'meaning'.`
			} else {
				return 'Explain that this is a rhetorical question, and explain the type and expected answer.'
			}
		},
	},
	{
		name: 'Agent of Passive',
		flags: ['Agent of Passive'],
		weight_calculator: flags => flags[0].weight,
		trigger_grouper: t => `${t.flags[0].encoding_anchor['verb']} by ${t.flags[0].encoding_anchor['agent']}`,
		prompt: flags => {
			if (flags[0].encoding_anchor['is_optional'] === 'true') {
				return `For the meaning, write something like "The original text did not include the one doing {verb}, but it is likely {agent}".
				For the check, write something like "Consider including {agent} as the one doing {verb} if your language needs it."`
			} else {
				// TODO this should be the third passive option
				return `For the meaning, explain that the original text indicates that {agent} did the {verb}, but it/they are not the focus.
				For the check, write something LIKE "Try to inlcude this in your translation, but keep it de-emphasized if possible."`
			}
		},
	},
	{
		name: 'Closing Quotation Frame',
		flags: ['Opening Quotation Frame', 'Closing Quotation Frame'],
		weight_calculator: flags => {
			const closing = flags.find(f => f.name.startsWith('Closing'))
			return closing && flags.length === 1 ? closing.weight : 0
		},
		flag_key: f => f.value,
		prompt: 'Write something LIKE "This is the end of the quote where {speaker} was speaking to {listener}". You do not need to write a \'check\' for this.',
	},
	{
		name: 'Vocabulary Alternate',
		flags: ['Vocabulary Alternate'],
		weight_calculator: flags => flags[0].weight,
		flag_grouper: flags => {
			const groups: CopilotEncodingFlag[][] = []
			let previous_complexity = ''
			for (let index = 0; index < flags.length; index++) {
				const current = flags[index]
				const complexity = current.value.includes('Simple') ? 'simple' : 'complex'

				const current_group = groups.at(-1)
				// the complex alternate always appears first
				if (!current_group || previous_complexity === 'simple' && complexity === 'complex') {
					groups.push([current])
				} else {
					current_group.push(current)
				}
				previous_complexity = complexity
			}
			return groups
		},
		prompt: `Determine whether the LWC used the complex alternate sentences or the simple ones.
		If the LWC used the complex alternate, write a note saying that it could also be understood as... (and transform it into natural text in the LWC as a quote).
		For long sentences, only quote the parts of the sentences that are different between the complex and simple versions.`,
	},
]

export function collect_triggers({ flags, language_profile }: { flags: CopilotEncodingFlag[], language_profile: LanguageProfile }): TriggerDataForLlm[] {
	return triggers.flatMap(trigger => apply_trigger({ trigger, flags, language_profile }))
}

export function triggers_match({ t1, t2 }: { t1: TriggerIdData, t2: TriggerIdData }) {
	return t1.name === t2.name && t1.node_id === t2.node_id
}

function apply_trigger({ trigger, flags, language_profile }: { trigger: TriggerTemplate, flags: CopilotEncodingFlag[], language_profile: LanguageProfile }): TriggerDataForLlm[] {
	const trigger_flags = flags.filter(f => trigger.flags.includes(f.name))
	const flag_keyer = trigger.flag_key || (f => f.encoding_anchor['node_id'])
	const grouper = trigger.flag_grouper || (flags => [...Map.groupBy(flags, flag_keyer).values()])
	const grouped = grouper(trigger_flags)

	const triggers: TriggerDataForLlm[] = []
	for (const flags of grouped) {
		const weight = trigger.weight_calculator(flags, language_profile)
		const trigger_data: TriggerDataForLlm = {
			name: trigger.name,
			node_id: flags[0].encoding_anchor.node_id,
			flags,
			weight,
		}
		if (trigger.prompt) {
			trigger_data.prompt = typeof trigger.prompt === 'string' ? trigger.prompt : trigger.prompt(flags, language_profile)
		}
		triggers.push(trigger_data)
	}
	if (trigger.trigger_grouper) {
		// just return the first trigger within a group
		return [...Map.groupBy(triggers, trigger.trigger_grouper).values()].map(trigger_group => trigger_group[0])
	}
	return triggers
}

function power_sum(flags: CopilotEncodingFlag[]): number {
	const pow = 2
	const pow_sum = flags.reduce((sum, flag) => sum + Math.pow(flag.weight, pow), 0)
	const pow_avg = Math.pow(pow_sum, 1 / pow)
	const rounded = Math.round(pow_avg)
	return Math.min(5, rounded)
}

function contrasting_value_prompt({ value, groupings }: { value: string, groupings: string[][] }): string | undefined {
	const contrastive_grouping = groupings.find(group => group.includes(value))
	if (!contrastive_grouping) {
		return undefined
	}
	const contrasting_values = contrastive_grouping.filter(v => v !== value)
	if (!contrasting_values.length) {
		// a grouping may have a single value, indicating that it should get a note, but without any contrasting values
		return undefined
	}
	return `In your note, explain the value, contrasting it with these other values: ${contrasting_values.join(', ')}.
	Do not simply repeat the values, but explain their meanings.`
}