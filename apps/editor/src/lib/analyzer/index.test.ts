import { describe, expect, test } from 'vitest'
import { analyze } from './index'
import { TOKEN_TYPE, create_token, create_lookup_result } from '#lib/token.js'
import type { Sentence } from '#lib/types.js'

describe('analyze pipeline', () => {
	test('handles empty sentence list', () => {
		const result = analyze([])
		expect(result.source_entities).toEqual([])
		expect(result.notes).toEqual([])
	})

	test('analyzes sentence with lookup tokens', () => {
		const noun_token = create_token({
			token: 'Paul',
			type: TOKEN_TYPE.LOOKUP_WORD,
			lookup_results: [create_lookup_result({ stem: 'Paul', part_of_speech: 'Noun', sense: 'A' })],
			tag: { noun_index: '1' },
		})
		const main_clause = create_token({ token: '{', type: TOKEN_TYPE.CLAUSE, sub_tokens: [noun_token], tag: { clause_type: 'main_clause' } })

		const sentence: Sentence = {
			clause: main_clause,
		}

		const result = analyze([sentence])
		expect(result.source_entities.length).toBeGreaterThan(0)
		expect(Array.isArray(result.notes)).toBe(true)
	})
})
