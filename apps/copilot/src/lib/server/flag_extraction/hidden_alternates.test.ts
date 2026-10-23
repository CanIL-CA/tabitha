import { describe, expect, test } from 'vitest'
import { drop_hidden_alternate_flags } from './hidden_alternates'
import type { CopilotEncodingFlag } from '@tabitha/types/copilot'

function flag({ name, value, node_id }: { name: string, value: string, node_id: string }): CopilotEncodingFlag {
	return { name, value, weight: 3, encoding_anchor: { node_id } }
}

const complex_alternate = flag({ name: 'Vocabulary Alternate', value: 'Single Sentence - Complex Vocabulary Alternate', node_id: '0' })
const simple_alternate = flag({ name: 'Vocabulary Alternate', value: 'Single Sentence - Simple Vocabulary Alternate', node_id: '1' })
const complex_noun = flag({ name: 'Noun Number', value: 'Singular', node_id: '0.0.0' })
const simple_noun = flag({ name: 'Noun Number', value: 'Singular', node_id: '1.0.0' })
const simple_verb = flag({ name: 'Verb Aspect', value: 'Inceptive', node_id: '1.1.0' })
const later_sentence_noun = flag({ name: 'Noun Number', value: 'Plural', node_id: '10.0.0' })

const flags = [complex_alternate, complex_noun, simple_alternate, simple_noun, simple_verb, later_sentence_noun]

describe('drop_hidden_alternate_flags', () => {
	test('drops flags inside the simple alternate when the text does not show it', () => {
		const kept = drop_hidden_alternate_flags({ flags, displayed_text: 'In the beginning God created the heavens and the earth.' })

		expect(kept).toEqual([complex_alternate, complex_noun, simple_alternate, later_sentence_noun])
	})

	test('keeps every flag when the text shows the simple alternate', () => {
		const kept = drop_hidden_alternate_flags({ flags, displayed_text: '(Complex) God created everything. (Simple) God made everything.' })

		expect(kept).toEqual(flags)
	})

	test('keeps every flag when there is no simple alternate', () => {
		const without_simple = [complex_alternate, complex_noun, later_sentence_noun]

		expect(drop_hidden_alternate_flags({ flags: without_simple, displayed_text: 'Some text' })).toEqual(without_simple)
	})

	test('does not treat a sibling node with a longer index as inside the alternate', () => {
		const kept = drop_hidden_alternate_flags({ flags: [simple_alternate, later_sentence_noun], displayed_text: 'Some text' })

		expect(kept).toContain(later_sentence_noun)
	})
})
