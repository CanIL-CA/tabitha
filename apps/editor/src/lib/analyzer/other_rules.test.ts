import { describe, expect, test } from 'vitest'
import { assign_noun_list_indexes, replace_punctuation } from './other_rules'
import { TOKEN_TYPE, create_token } from '#lib/token.js'
import type { EditorAnalyzedEntity } from '@tabitha/types'
import type { Sentence } from '#lib/types.js'

describe('other_rules', () => {
	test('assign_noun_list_indexes gives each distinct noun its own index', () => {
		const entity1: EditorAnalyzedEntity = {
			category: 'Noun',
			value: 'Paul',
			features: [],
			concept: { stem: 'Paul', sense: 'A', part_of_speech: 'Noun' },
			pairing_concept: null,
			pairing_type: null,
			noun_list_index: '1',
		}
		const entity2: EditorAnalyzedEntity = {
			category: 'Noun',
			value: 'letter',
			features: [],
			concept: { stem: 'letter', sense: 'A', part_of_speech: 'Noun' },
			pairing_concept: null,
			pairing_type: null,
			noun_list_index: '2',
		}

		assign_noun_list_indexes([entity1, entity2])
		expect(entity1.noun_list_index).toBe('1')
		expect(entity2.noun_list_index).toBe('2')
	})

	test('assign_noun_list_indexes reuses the index of a repeated noun', () => {
		const make_paul = (): EditorAnalyzedEntity => ({
			category: 'Noun',
			value: 'Paul',
			features: [],
			concept: { stem: 'Paul', sense: 'A', part_of_speech: 'Noun' },
			pairing_concept: null,
			pairing_type: null,
			noun_list_index: null,
		})
		const [first, second] = [make_paul(), make_paul()]

		assign_noun_list_indexes([first, second])
		expect([first.noun_list_index, second.noun_list_index]).toEqual(['1', '1'])
	})

	test('replace_punctuation replaces sentence terminal punctuation', () => {
		const token_punct = create_token({ token: '!', type: TOKEN_TYPE.PUNCTUATION })
		const main_clause = create_token({ token: '{', type: TOKEN_TYPE.CLAUSE, sub_tokens: [token_punct], tag: { clause_type: 'main_clause' } })

		const sentences: Sentence[] = [{ clause: main_clause }]
		const result = replace_punctuation(sentences)
		expect(result.length).toBe(1)
	})
})
