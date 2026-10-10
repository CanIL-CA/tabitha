import { textify, remove_some_gap_tokens, find_replace, backtranslate } from '.'
import { describe, expect, test } from 'vitest'
import { MESSAGE_TYPE, TOKEN_TYPE, create_token, create_added_token, create_gap_token, create_clause_token } from '#lib/token.js'
import { tokenize_input } from '#lib/parser/tokenize.js'
import { clausify } from '#lib/parser/clausify.js'
import { RULES, rules_applier } from '#lib/rules/index.js'
import type { Sentence } from '#lib/types.js'

/**
 * textify simply produces the plain text equivalent for each token, joined by a space.
 */
describe('textify', () => {

	test('You(people) will become-J _randomNote a house of the Spirit.', () => {
		const test_tokens = tokenize_input('You(people) will become-J _randomNote a house of the Spirit.')
		const expected = 'You will become a house of the Spirit .'

		const result = textify(clausify(test_tokens))
		expect(result).toBe(expected)
	})

	test('Jesus said to Jesus\' followers/disciples _implicit, ["You(followers) (imp) go."]', () => {
		const test_tokens = tokenize_input('Jesus said to Jesus\' followers/disciples _implicit, ["You(followers) (imp) go."]')
		const expected = 'Jesus said to Jesus\' disciples , " You (imp) go . "'

		const result = textify(clausify(test_tokens))
		expect(result).toBe(expected)
	})

	test('Added token', () => {
		const test_tokens = tokenize_input('This is a test.')
		const rule_id = 'BT_TEST'
		test_tokens.splice(2, 0, create_added_token({ token: 'added', message: { ...MESSAGE_TYPE.ERROR, message: 'message', rule_id } }))
		const expected = 'This is a test .'

		const result = textify(clausify(test_tokens))
		expect(result).toBe(expected)
	})

	test('(poetry-begin) John will take-away those things from Mary-Jane. (poetry-end)', () => {
		const test_tokens = tokenize_input('(poetry-begin) John will take-away those things from Mary-Jane. (poetry-end) Book 5:2-3.')
		const expected = '(poetry-begin) John will take away those things from Mary Jane . (poetry-end) Book 5 : 2 - 3 .'

		// apply the syntax rules so the verse reference gets handled correctly
		const result = textify(rules_applier(RULES.SYNTAX)(clausify(test_tokens)))
		expect(result).toBe(expected)
	})

})

describe('backtranslate integration and helper pipeline functions', () => {
	test('remove_some_gap_tokens filters out GAP_INTV_V tokens', () => {
		const gap_token = create_gap_token({ rule_id: 'rule:1', label: 'INTV_V' })
		const normal_token = create_token({ token: 'John', type: TOKEN_TYPE.LOOKUP_WORD })
		const sentence: Sentence = { clause: create_clause_token({ sub_tokens: [gap_token, normal_token] }) }

		const cleaned = remove_some_gap_tokens([sentence])
		expect(cleaned[0].clause.sub_tokens).toHaveLength(1)
		expect(cleaned[0].clause.sub_tokens[0].token).toBe('John')
	})

	test('find_replace formats verse references, quotes, and punctuation spacing', () => {
		const text = '1: 10 - 12 , " Hello world " >> <<'
		const formatted = find_replace(text)
		expect(formatted).not.toContain(' - ')
		expect(formatted).not.toContain(', " ')
	})

	test('backtranslate full end-to-end pipeline', () => {
		const test_tokens = tokenize_input('Jesus prayed to God.')
		const result = backtranslate(clausify(test_tokens))
		expect(typeof result).toBe('string')
		expect(result).toContain('Jesus')
	})
})

// TODO need E2E testing for these
// describe('structural', () => {
// 	test('Imperatives', () => {
// 		const test_tokens = tokenize_input('You(person) (imp) go. And you(person) (imp) be happy.')
// 		const expected = 'Go. And be happy.'

// 		const result = backtranslate2(test_tokens)
// 		expect(result).toBe(expected)
// 	})

// 	test('Descriptive Relative Clauses', () => {
// 		const test_tokens = tokenize_input('John [who was with Mary] read 2 books [_descriptive that were big].')
// 		const expected = 'John, who was with Mary, read 2 books, that were big.'

// 		const result = backtranslate2(test_tokens)
// 		expect(result).toBe(expected)
// 	})
// })
