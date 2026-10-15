import { describe, expect, test } from 'vitest'
import { collect_triggers, triggers_match } from './triggers'
import type { LanguageProfile } from '#lib/types.js'
import type { CopilotEncodingFlag } from '@tabitha/types/copilot'

const profile: LanguageProfile = {
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

function flag({ name, value, node_id, weight = 3, anchor = {} }: {
	name: string
	value: string
	node_id: string
	weight?: number
	anchor?: Record<string, string>
}): CopilotEncodingFlag {
	return { name, value, weight, encoding_anchor: { node_id, ...anchor } }
}

function collect({ flags, language_profile = profile }: { flags: CopilotEncodingFlag[], language_profile?: LanguageProfile }) {
	return collect_triggers({ flags, language_profile })
}

describe('triggers_match', () => {
	test('matches when name and node are the same', () => {
		expect(triggers_match({ t1: { name: 'TAMP', node_id: '0.1' }, t2: { name: 'TAMP', node_id: '0.1' } })).toBe(true)
	})

	test.each([
		[{ name: 'TAMP', node_id: '0.1' }, { name: 'Metaphor', node_id: '0.1' }],
		[{ name: 'TAMP', node_id: '0.1' }, { name: 'TAMP', node_id: '0.2' }],
	])('does not match when either differs (%o vs %o)', (t1, t2) => {
		expect(triggers_match({ t1, t2 })).toBe(false)
	})
})

describe('collect_triggers', () => {
	test('returns nothing without flags', () => {
		expect(collect({ flags: [] })).toEqual([])
	})

	test('ignores flags no trigger uses', () => {
		expect(collect({ flags: [flag({ name: 'Unused Flag', value: 'x', node_id: '0' })] })).toEqual([])
	})

	test("a single-flag trigger takes that flag's weight and node", () => {
		const metaphor = flag({ name: 'Metaphor', value: 'x', node_id: '2.1', weight: 4, anchor: { subject: 'word', state: 'light' } })

		const [trigger] = collect({ flags: [metaphor] })

		expect(trigger).toMatchObject({ name: 'Metaphor', node_id: '2.1', weight: 4, flags: [metaphor] })
	})

	test('flags on different nodes make separate triggers', () => {
		const flags = [
			flag({ name: 'Speaker Attitude', value: 'Angry', node_id: '0' }),
			flag({ name: 'Speaker Attitude', value: 'Joyful', node_id: '1' }),
		]

		expect(collect({ flags }).map(t => t.node_id).toSorted()).toEqual(['0', '1'])
	})

	test('keeps only the first of several triggers that say the same thing', () => {
		const flags = [
			flag({ name: 'Speaker Attitude', value: 'Angry', node_id: '0' }),
			flag({ name: 'Speaker Attitude', value: 'Angry', node_id: '5' }),
		]

		const triggers = collect({ flags })

		expect(triggers).toHaveLength(1)
		expect(triggers[0].node_id).toBe('0')
	})

	test('noun triggers are deduplicated per noun and value', () => {
		const flags = [
			flag({ name: 'Noun Number', value: 'Plural', node_id: '0', anchor: { noun_index: '1' } }),
			flag({ name: 'Noun Number', value: 'Plural', node_id: '4', anchor: { noun_index: '1' } }),
			flag({ name: 'Noun Number', value: 'Plural', node_id: '6', anchor: { noun_index: '2' } }),
		]

		expect(collect({ flags })).toHaveLength(2)
	})

	describe('TAMP', () => {
		test('combines flags on one verb into one trigger with a power-sum weight', () => {
			const flags = [
				flag({ name: 'Verb Time', value: 'Historic Past', node_id: '0', weight: 3 }),
				flag({ name: 'Verb Aspect', value: 'Gnomic', node_id: '0', weight: 4 }),
			]

			const triggers = collect({ flags })

			expect(triggers).toHaveLength(1)
			expect(triggers[0]).toMatchObject({ name: 'TAMP', node_id: '0', weight: 5 })
			expect(triggers[0].flags).toHaveLength(2)
		})

		test('caps the combined weight at 5', () => {
			const flags = [
				flag({ name: 'Verb Time', value: 'Historic Past', node_id: '0', weight: 5 }),
				flag({ name: 'Verb Aspect', value: 'Gnomic', node_id: '0', weight: 5 }),
				flag({ name: 'Verb Mood', value: 'Definite Potential', node_id: '0', weight: 5 }),
			]

			expect(collect({ flags })[0].weight).toBe(5)
		})

		test('a lone negative polarity carries no weight', () => {
			const [trigger] = collect({ flags: [flag({ name: 'Verb Polarity', value: 'Negative', node_id: '0', weight: 4 })] })

			expect(trigger.weight).toBe(0)
		})

		test('a lone non-negative polarity keeps its weight', () => {
			const [trigger] = collect({ flags: [flag({ name: 'Verb Polarity', value: 'Emphatic Affirmative', node_id: '0', weight: 4 })] })

			expect(trigger.weight).toBe(4)
		})

		test('explains a Time value that needs more than past or future', () => {
			const [trigger] = collect({ flags: [flag({ name: 'Verb Time', value: 'Eternity Past', node_id: '0' })] })

			expect(trigger.prompt).toContain('Eternity Past')
		})
	})

	describe('Social Dynamic', () => {
		test('needs more than one of speaker, listener and age to carry weight', () => {
			const alone = collect({ flags: [flag({ name: 'Speaker', value: 'Pharisee', node_id: '0', weight: 4 })] })
			const together = collect({ flags: [
				flag({ name: 'Speaker', value: 'Pharisee', node_id: '0', weight: 4 }),
				flag({ name: 'Listener', value: 'Jesus', node_id: '0', weight: 4 }),
			] })

			expect(alone[0].weight).toBe(0)
			expect(together[0].weight).toBeGreaterThan(0)
		})

		test('tells the model to leave out age when the listener is a crowd', () => {
			const [trigger] = collect({ flags: [
				flag({ name: 'Listener', value: 'Crowd', node_id: '0' }),
				flag({ name: 'Speaker-Listener Age', value: 'Older - Same Generation', node_id: '0' }),
			] })

			expect(trigger.prompt).toContain('Speaker-Listener Age')
		})

		test('has no prompt when age is absent', () => {
			const [trigger] = collect({ flags: [
				flag({ name: 'Speaker', value: 'Pharisee', node_id: '0' }),
				flag({ name: 'Listener', value: 'Jesus', node_id: '0' }),
			] })

			expect(trigger.prompt).toBe('')
		})
	})

	describe('Noun Person', () => {
		const person = (value: string) => flag({ name: 'Noun Person', value, node_id: '0', anchor: { noun_index: '1' } })

		test('speaks of the inclusive distinction only when the language has it', () => {
			const with_clusivity = collect({ flags: [person('First Inclusive')], language_profile: { ...profile, noun_clusivity: true } })[0].prompt
			const without = collect({ flags: [person('First Inclusive')] })[0].prompt

			expect(with_clusivity).not.toEqual(without)
			expect(without).toContain('Inclusive')
		})

		test('asks for a note about self-reference when a person is expressed as third', () => {
			expect(collect({ flags: [person('First as Third')] })[0].prompt).toContain('{noun}')
			expect(collect({ flags: [person('Second as Third')] })[0].prompt).toContain('{noun}')
		})

		test('has an empty prompt for a plain person', () => {
			expect(collect({ flags: [person('Third')] })[0].prompt).toBe('')
		})
	})

	describe('contrast prompts', () => {
		test('Noun Proximity contrasts with the other values in its group', () => {
			const flags = [flag({ name: 'Noun Proximity', value: 'Near Speaker', node_id: '0', anchor: { noun_index: '1' } })]

			const [trigger] = collect({ flags, language_profile: { ...profile, noun_proximity: [['Near Speaker', 'Near Listener', 'Far']] } })

			expect(trigger.prompt).toContain('Near Listener, Far')
			expect(trigger.prompt).not.toContain('Near Speaker,')
		})

		test('has no contrast prompt for a value outside every group or alone in its group', () => {
			const flags = [flag({ name: 'Noun Proximity', value: 'Near Speaker', node_id: '0', anchor: { noun_index: '1' } })]

			expect(collect({ flags })[0].prompt).toBe('')
			expect(collect({ flags, language_profile: { ...profile, noun_proximity: [['Near Speaker']] } })[0].prompt).toBe('')
		})

		test('Modifier Degree falls back to a note about excess for "too"', () => {
			const flags = [flag({ name: 'Modifier Degree', value: "'too'", node_id: '0', anchor: { concept: 'big' } })]

			expect(collect({ flags })[0].prompt).toContain('excess')
		})

		test('Modifier Degree prefers a contrast when the language groups the value', () => {
			const flags = [flag({ name: 'Modifier Degree', value: "'too'", node_id: '0', anchor: { concept: 'big' } })]

			const [trigger] = collect({ flags, language_profile: { ...profile, modifier_degree: [["'too'", "'very'"]] } })

			expect(trigger.prompt).toContain("'very'")
			expect(trigger.prompt).not.toContain('excess')
		})

		test('Modifier Degree has an empty prompt for another value without a group', () => {
			const flags = [flag({ name: 'Modifier Degree', value: "'very'", node_id: '0', anchor: { concept: 'big' } })]

			expect(collect({ flags })[0].prompt).toBe('')
		})
	})

	describe('Noun Emphasis/Focus', () => {
		test('words a significant place or time differently from other participants', () => {
			const prompt_for = (value: string) => collect({ flags: [flag({ name: 'Noun Participant Status', value, node_id: '0', anchor: { noun_index: '1' } })] })[0].prompt

			expect(prompt_for('Significant Time')).toBe(prompt_for('Significant Location'))
			expect(prompt_for('Significant Time')).not.toBe(prompt_for('Major Participant'))
		})
	})

	describe('Rhetorical Question', () => {
		test('groups a question with its equivalent statement in the adjacent clause', () => {
			const flags = [
				flag({ name: 'Rhetorical Question', value: 'Question', node_id: '3.0' }),
				flag({ name: 'Rhetorical Question', value: 'Equivalent Statement', node_id: '3.1' }),
				flag({ name: 'Rhetorical Question', value: 'Question', node_id: '4.0' }),
			]

			const triggers = collect({ flags })

			expect(triggers).toHaveLength(2)
			const paired = triggers.find(t => t.flags.length === 2)
			expect(paired?.prompt).toContain('equivalent statement')
		})

		test('a top-level question (no dot in its node id) still forms a trigger', () => {
			const [trigger] = collect({ flags: [flag({ name: 'Rhetorical Question', value: 'Question', node_id: '3' })] })

			expect(trigger.node_id).toBe('3')
		})
	})

	describe('Metonymy', () => {
		test('words the explanation by whether the metonymy type is dynamic', () => {
			const prompt_for = (metonymy_type: string) => collect({ flags: [flag({ name: 'Metonymy', value: 'x', node_id: '0', anchor: { metonymy_type } })] })[0].prompt

			expect(prompt_for('Dynamic Equivalence')).not.toBe(prompt_for('Literal'))
		})
	})

	describe('Agent of Passive', () => {
		test('words the note by whether the agent is optional', () => {
			const prompt_for = (is_optional: string) => collect({ flags: [flag({ name: 'Agent of Passive', value: 'x', node_id: '0', anchor: { verb: 'see', agent: 'God', is_optional } })] })[0].prompt

			expect(prompt_for('true')).not.toBe(prompt_for('false'))
		})
	})

	describe('Closing Quotation Frame', () => {
		test('weighs a closing frame that stands alone and drops one paired with an opening frame', () => {
			const closing = flag({ name: 'Closing Quotation Frame', value: 'Jesus', node_id: '0', weight: 4 })
			const opening = flag({ name: 'Opening Quotation Frame', value: 'Jesus', node_id: '0', weight: 4 })

			expect(collect({ flags: [closing] })[0].weight).toBe(4)
			expect(collect({ flags: [opening, closing] })[0].weight).toBe(0)
		})
	})

	describe('Vocabulary Alternate', () => {
		test('starts a new group at each complex alternate that follows a simple one', () => {
			const alternate = ({ value, node_id }: { value: string, node_id: string }) => flag({ name: 'Vocabulary Alternate', value, node_id })
			const flags = [
				alternate({ value: 'Complex Alternate', node_id: '0' }),
				alternate({ value: 'Simple Alternate', node_id: '1' }),
				alternate({ value: 'Complex Alternate', node_id: '2' }),
				alternate({ value: 'Simple Alternate', node_id: '3' }),
			]

			const triggers = collect({ flags })

			expect(triggers).toHaveLength(2)
			expect(triggers.map(t => t.flags.length)).toEqual([2, 2])
		})
	})
})
