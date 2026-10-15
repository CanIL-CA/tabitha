import { describe, expect, test } from 'vitest'
import { assign_flag_weights } from './flag_weighting'
import { default_flag_weights_for_brief, default_flag_weights_for_discern } from './default_flag_weights'
import type { CopilotNoteSettings, LanguageProfile } from '#lib/types.js'
import type { CopilotEncodingFlag } from '@tabitha/types/copilot'

// Every option at the setting that adds no profile-specific weights
const plain_profile: LanguageProfile = {
	multiple_past: false,
	multiple_future: false,
	noun_number: [],
	noun_proximity: [],
	noun_clusivity: false,
	as_third_handling: 'third',
	modifier_degree: [],
	passive: 'agent_allowed',
	rhetorical_questions: true,
	honorifics: false,
	speech_formula_position: 'before',
}

function flag({ name, value }: { name: string, value: string }): CopilotEncodingFlag {
	return { name, value, encoding_anchor: { node_id: '0' }, weight: -1 }
}

function weight_of({ flag: input, profile = {}, mode = 'discern' }: { flag: CopilotEncodingFlag, profile?: Partial<LanguageProfile>, mode?: CopilotNoteSettings['mode'] }): number {
	const settings = { mode, language_profile: { ...plain_profile, ...profile } } as CopilotNoteSettings
	return assign_flag_weights({ flags: [input], settings })[0].weight
}

describe('assign_flag_weights', () => {
	test('returns a copy of each flag with its weight set, leaving the input alone', () => {
		const input = flag({ name: 'Verb Aspect', value: 'Gnomic' })

		const [weighted] = assign_flag_weights({ flags: [input], settings: { mode: 'discern', language_profile: plain_profile } as CopilotNoteSettings })

		expect(weighted).toEqual({ ...input, weight: 5 })
		expect(input.weight).toBe(-1)
	})

	test('uses the discern defaults in discern mode and the brief defaults otherwise', () => {
		const input = flag({ name: 'Verb Time', value: 'Historic Past' })

		expect(weight_of({ flag: input, mode: 'discern' })).toBe(default_flag_weights_for_discern['Verb Time']['Historic Past'])
		expect(weight_of({ flag: input, mode: 'brief' })).toBe(default_flag_weights_for_brief['Verb Time']['Historic Past'])
	})

	test('weighs a flag no rule mentions as zero', () => {
		expect(weight_of({ flag: flag({ name: 'Made Up Flag', value: 'x' }) })).toBe(0)
	})

	test('weighs a value its flag lists nothing for as zero', () => {
		expect(weight_of({ flag: flag({ name: 'Verb Aspect', value: 'Not A Real Aspect' }) })).toBe(0)
	})

	test('keeps flag order and weighs each flag independently', () => {
		const flags = [flag({ name: 'Verb Aspect', value: 'Gnomic' }), flag({ name: 'Verb Aspect', value: 'Imperfective' })]

		const weighted = assign_flag_weights({ flags, settings: { mode: 'discern', language_profile: plain_profile } as CopilotNoteSettings })

		expect(weighted.map(({ value, weight }) => [value, weight])).toEqual([['Gnomic', 5], ['Imperfective', 0]])
	})
})

describe('language profile weights', () => {
	test.each([
		['multiple_past', 'Verb Time', 'Yesterday', 4],
		['multiple_past', 'Verb Time', 'Unknown Past', 2],
		['multiple_future', 'Verb Time', 'Tomorrow', 4],
		['multiple_future', 'Verb Time', 'Unknown Future', 2],
	] as const)('%s makes %s "%s" weigh %i', (option, name, value, expected) => {
		expect(weight_of({ flag: flag({ name, value }), profile: { [option]: true } })).toBe(expected)
	})

	test('multiple_past and multiple_future combine rather than replace each other', () => {
		const profile = { multiple_past: true, multiple_future: true }

		expect(weight_of({ flag: flag({ name: 'Verb Time', value: 'Yesterday' }), profile })).toBe(4)
		expect(weight_of({ flag: flag({ name: 'Verb Time', value: 'Tomorrow' }), profile })).toBe(4)
	})

	test("a language's distinguished noun numbers weigh 5", () => {
		const profile = { noun_number: ['Dual'] }

		expect(weight_of({ flag: flag({ name: 'Noun Number', value: 'Dual' }), profile })).toBe(5)
		expect(weight_of({ flag: flag({ name: 'Noun Number', value: 'Plural' }), profile })).toBe(0)
	})

	test('every value in a contrastive grouping weighs 5', () => {
		const profile = { noun_proximity: [['Near Speaker', 'Near Listener'], ['Far']], modifier_degree: [['Very', 'Extremely']] }

		expect(weight_of({ flag: flag({ name: 'Noun Proximity', value: 'Near Listener' }), profile })).toBe(5)
		expect(weight_of({ flag: flag({ name: 'Noun Proximity', value: 'Far' }), profile })).toBe(5)
		expect(weight_of({ flag: flag({ name: 'Modifier Degree', value: 'Extremely' }), profile })).toBe(5)
	})

	test('clusivity weighs first-person inclusive and exclusive', () => {
		const profile = { noun_clusivity: true }

		expect(weight_of({ flag: flag({ name: 'Noun Person', value: 'First Inclusive' }), profile })).toBe(3)
		expect(weight_of({ flag: flag({ name: 'Noun Person', value: 'First Exclusive' }), profile })).toBe(5)
	})

	test('when passives cannot carry an agent, a spelled-out agent weighs 5 and generic ones 1', () => {
		const profile = { passive: 'none' } as const

		expect(weight_of({ flag: flag({ name: 'Agent of Passive', value: 'Moses-A' }), profile })).toBe(5)
		expect(weight_of({ flag: flag({ name: 'Agent of Passive', value: 'God-A' }), profile })).toBe(1)
	})

	test('a language without rhetorical questions weighs the equivalent statement 5', () => {
		expect(weight_of({ flag: flag({ name: 'Rhetorical Question', value: 'Equivalent Statement' }), profile: { rhetorical_questions: false } })).toBe(5)
	})

	test('honorifics weigh the speaker and listener, discounting God and Man', () => {
		const profile = { honorifics: true }

		expect(weight_of({ flag: flag({ name: 'Speaker', value: 'God' }), profile })).toBe(0)
		expect(weight_of({ flag: flag({ name: 'Speaker', value: 'Man' }), profile })).toBe(1)
		expect(weight_of({ flag: flag({ name: 'Speaker', value: 'Pharisee' }), profile })).toBe(4)
		expect(weight_of({ flag: flag({ name: 'Listener', value: 'Crowd' }), profile })).toBe(2)
		expect(weight_of({ flag: flag({ name: 'Speaker-Listener Age', value: 'Older - Different Generation' }), profile })).toBe(5)
	})

	test('a speech formula that does not come before the quote weighs the closing frame highest', () => {
		const profile = { speech_formula_position: 'after' } as const

		expect(weight_of({ flag: flag({ name: 'Closing Quotation Frame', value: 'x' }), profile })).toBe(5)
		expect(weight_of({ flag: flag({ name: 'Opening Quotation Frame', value: 'x' }), profile })).toBe(1)
	})

	test('custom weights replace the profile and default weights for that flag', () => {
		const profile = { custom_weights: { 'Verb Aspect': { Gnomic: 1 } } }

		expect(weight_of({ flag: flag({ name: 'Verb Aspect', value: 'Gnomic' }), profile })).toBe(1)
	})

	test('a "*" entry weighs every value of the flag that has no entry of its own', () => {
		const profile = { custom_weights: { 'Verb Aspect': { '*': 3 } } }

		expect(weight_of({ flag: flag({ name: 'Verb Aspect', value: 'Anything' }), profile })).toBe(3)
	})

	test('a profile weight of zero beats a non-zero default', () => {
		const profile = { custom_weights: { 'Verb Aspect': { Gnomic: 0 } } }

		expect(weight_of({ flag: flag({ name: 'Verb Aspect', value: 'Gnomic' }), profile })).toBe(0)
	})

	test('falls back to the default weights when the profile lists the flag but not the value', () => {
		const profile = { noun_number: ['Dual'] }

		expect(weight_of({ flag: flag({ name: 'Verb Aspect', value: 'Gnomic' }), profile })).toBe(5)
	})
})
