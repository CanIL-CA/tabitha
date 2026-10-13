import { describe, expect, test } from 'vitest'
import { phrasify } from './phrasify'
import { flatten_sentences } from './clausify'
import { TOKEN_TYPE, create_token, create_lookup_result } from '#lib/token.js'

describe('phrasify', () => {
	test('handles empty sentence array', () => {
		const result = phrasify([])
		expect(result).toEqual([])
	})

	test('wraps Noun token in NP phrase tokens', () => {
		const noun_token = create_token({ token: 'Daniel', type: TOKEN_TYPE.LOOKUP_WORD, lookup_results: [create_lookup_result({ stem: 'Daniel', part_of_speech: 'Noun', sense: 'A' })] })
		const main_clause = create_token({ token: '{', type: TOKEN_TYPE.CLAUSE, sub_tokens: [noun_token] })

		const result = phrasify([{ clause: main_clause }])
		const tokens = flatten_sentences(result)

		expect(tokens.length).toBe(3)
		expect(tokens[0].token).toBe('{NP')
		expect(tokens[1].token).toBe('Daniel')
		expect(tokens[2].token).toBe('}')
	})

	test('wraps Verb token in VP phrase tokens', () => {
		const verb_token = create_token({ token: 'prayed', type: TOKEN_TYPE.LOOKUP_WORD, lookup_results: [create_lookup_result({ stem: 'pray', part_of_speech: 'Verb', sense: 'A' })] })
		const main_clause = create_token({ token: '{', type: TOKEN_TYPE.CLAUSE, sub_tokens: [verb_token] })

		const result = phrasify([{ clause: main_clause }])
		const tokens = flatten_sentences(result)

		expect(tokens.length).toBe(3)
		expect(tokens[0].token).toBe('{VP')
		expect(tokens[1].token).toBe('prayed')
		expect(tokens[2].token).toBe('}')
	})

	test('recursively processes nested subordinate clauses', () => {
		const noun_token = create_token({ token: 'God', type: TOKEN_TYPE.LOOKUP_WORD, lookup_results: [create_lookup_result({ stem: 'God', part_of_speech: 'Noun', sense: 'A' })] })
		const sub_clause = create_token({ token: '[', type: TOKEN_TYPE.CLAUSE, sub_tokens: [noun_token] })
		const main_clause = create_token({ token: '{', type: TOKEN_TYPE.CLAUSE, sub_tokens: [sub_clause] })

		const result = phrasify([{ clause: main_clause }])
		const tokens = flatten_sentences(result)

		expect(tokens.some(t => t.token === '{NP')).toBe(true)
		expect(tokens.some(t => t.token === 'God')).toBe(true)
	})
})
