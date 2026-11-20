import { describe, expect, test } from 'vitest'
import { entityfy } from './entityfy'
import { TOKEN_TYPE, create_token, create_lookup_result } from '#lib/token.js'

describe('entityfy', () => {
	test('converts main clause structure with delimiters', () => {
		const token_noun = create_token({
			token: 'Paul',
			type: TOKEN_TYPE.LOOKUP_WORD,
			lookup_results: [create_lookup_result({ stem: 'Paul', part_of_speech: 'Noun', sense: 'A' })],
			tag: { noun_index: '1' },
		})

		const main_clause = create_token({ token: '{', type: TOKEN_TYPE.CLAUSE, sub_tokens: [token_noun], tag: { clause_type: 'main_clause' } })

		const entities = entityfy([{ clause: main_clause }])
		expect(entities[0].category).toBe('Clause')
		expect(entities[0].value).toBe('{')
		expect(entities[entities.length - 1].value).toBe('}')
	})

	test('preserves an explicit noun_list_index rather than collapsing it to 1', () => {
		const token_noun = create_token({
			token: 'letter',
			type: TOKEN_TYPE.LOOKUP_WORD,
			lookup_results: [create_lookup_result({ stem: 'letter', part_of_speech: 'Noun', sense: 'A' })],
			tag: { noun_index: '3' },
		})

		const entities = entityfy([{ clause: token_noun }])
		expect(entities[0].noun_list_index).toBe('3')
	})

	test('handles subordinate clauses with bracket notation', () => {
		const sub_clause = create_token({ token: '[', type: TOKEN_TYPE.CLAUSE, sub_tokens: [], tag: { clause_type: 'subordinate_clause' } })

		const entities = entityfy([{ clause: sub_clause }])
		expect(entities[0].value).toBe('[')
		expect(entities[entities.length - 1].value).toBe(']')
	})
})
