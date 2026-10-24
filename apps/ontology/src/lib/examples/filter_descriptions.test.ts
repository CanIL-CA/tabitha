import { describe, expect, it } from 'vitest'
import { context_argument_map } from './filters'
import { filter_description } from './filter_descriptions'

describe('examples/filter_descriptions', () => {
	it('describes every filter of every part of speech', () => {
		const missing = [...context_argument_map].flatMap(([part_of_speech, names]) => names
			.filter(name => !filter_description({ part_of_speech, name }))
			.map(name => `${part_of_speech}: ${name}`))

		expect(missing).toEqual([])
	})

	it('explains that Modified Noun excludes the noun a predicative adjective describes', () => {
		const modified_noun = filter_description({ part_of_speech: 'Adjective', name: 'Modified Noun' })
		const agent = filter_description({ part_of_speech: 'Adjective', name: 'Agent' })

		expect(modified_noun).toMatch(/not set for predicative/i)
		expect(agent).toMatch(/predicative/i)
	})

	it('words the same filter name differently for different parts of speech', () => {
		const adjective_verb = filter_description({ part_of_speech: 'Adjective', name: 'Verb' })
		const adverb_verb = filter_description({ part_of_speech: 'Adverb', name: 'Verb' })

		expect(adjective_verb).not.toEqual(adverb_verb)
	})

	it('has no description for a filter that does not exist', () => {
		expect(filter_description({ part_of_speech: 'Noun', name: 'Book' })).toBeUndefined()
		expect(filter_description({ part_of_speech: 'Conjunction', name: 'Pairing' })).toBeUndefined()
	})
})
