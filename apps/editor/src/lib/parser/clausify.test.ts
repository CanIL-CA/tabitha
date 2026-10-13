import { describe, expect, test } from 'vitest'
import { TOKEN_TYPE, create_clause_token, create_added_token, create_token, MESSAGE_TYPE } from '../token'
import { ERRORS } from './error_messages'
import { clausify, flatten_sentences } from './clausify'
import type { CheckerTokenType } from '@tabitha/types'
import type { Token } from '#lib/types.js'
import { create_sentence_for_test } from '#lib/test_helps.js'

function create_tokens(tokens: string[]): Token[] {
	const type = (token: string): CheckerTokenType => token.length > 1 ? TOKEN_TYPE.LOOKUP_WORD : TOKEN_TYPE.PUNCTUATION
	return tokens.map(token => create_token({ token, type: type(token) }))
}

function create_error_token({ token, message }: {
	token: string
	message: string
}): Token {
	return create_added_token({ token, message: { ...MESSAGE_TYPE.ERROR, message, rule_id: 'clause:syntax' } })
}

describe('clausify: brackets', () => {
	describe('balanced', () => {
		test('token', () => {
			const test_tokens = create_tokens(['token','.'])
			const expected = [create_sentence_for_test(test_tokens)]

			expect(clausify(test_tokens)).toEqual(expected)
		})

		test('[token] ', () => {
			const test_tokens = create_tokens(['[','token',']','.'])
			const expected = [
				create_sentence_for_test([
					create_clause_token({ sub_tokens: test_tokens.slice(0, 3) }),
					test_tokens[3],
				]),
			]

			expect(clausify(test_tokens)).toEqual(expected)
		})

		test('[token] [token]', () => {
			const test_tokens = create_tokens(['[','token',']','[','token',']','.'])
			const expected = [
				create_sentence_for_test([
					create_clause_token({ sub_tokens: test_tokens.slice(0, 3) }),
					create_clause_token({ sub_tokens: test_tokens.slice(3, 6) }),
					test_tokens[6],
				]),
			]

			expect(clausify(test_tokens)).toEqual(expected)
		})

		test('[token [token]]', () => {
			const test_tokens = create_tokens(['[','token','[','token',']', ']','.'])
			const expected = [
				create_sentence_for_test([
					create_clause_token({ sub_tokens: [
						test_tokens[0],
						test_tokens[1],
						create_clause_token({ sub_tokens: test_tokens.slice(2, 5) }),
						test_tokens[5],
					] }),
					test_tokens[6],
				]),
			]

			expect(clausify(test_tokens)).toEqual(expected)
		})

		test('[bad[token]]', () => {
			const test_tokens = create_tokens(['[','bad[','token',']', ']','.'])
			const expected = [
				create_sentence_for_test([
					create_clause_token({ sub_tokens: [
						test_tokens[0],
						create_clause_token({ sub_tokens: test_tokens.slice(1, 4) }),
						test_tokens[4],
					] }),
					test_tokens[5],
				]),
			]

			expect(clausify(test_tokens)).toEqual(expected)
		})

		test('[token [token] [token [token]]]', () => {
			const test_tokens = create_tokens(['[','token','[','token',']','[','token','[','token',']',']',']','.'])
			const expected = [
				create_sentence_for_test([
					create_clause_token({ sub_tokens: [
						test_tokens[0],
						test_tokens[1],
						create_clause_token({ sub_tokens: test_tokens.slice(2, 5) }),
						create_clause_token({ sub_tokens: [
							test_tokens[5],
							test_tokens[6],
							create_clause_token({ sub_tokens: test_tokens.slice(7, 10) }),
							test_tokens[10],
						] }),
						test_tokens[11],
					] }),
					test_tokens[12],
				]),
			]

			expect(clausify(test_tokens)).toEqual(expected)
		})

		test('warns when clause nesting depth exceeds 3 levels', () => {
			const test_tokens = create_tokens(['[', 'a', '[', 'b', '[', 'c', '[', 'd', ']', ']', ']', ']', '.'])
			const result = clausify(test_tokens)
			const flattened = flatten_sentences(result)
			const warning_added = flattened.find(t => t.messages.some(m => m.rule_id === 'clause:nesting_depth'))
			expect(warning_added).toBeDefined()
		})
	})

	describe('unbalanced single sentence', () => {
		test('[token => should result in an extra "]" token at the end with the appropriate message', () => {
			const test_tokens = create_tokens(['[','token','.'])

			const expected = [
				create_sentence_for_test([
					create_clause_token({ sub_tokens: [
						...test_tokens.slice(0, 3),
						create_error_token({ token: ']', message: ERRORS.MISSING_CLOSING_BRACKET }),
					] }),
				]),
			]

			expect(clausify(test_tokens)).toEqual(expected)
		})

		test('[token [token] => should result in an extra "]" token at the end with the appropriate message', () => {
			const test_tokens = create_tokens(['[','token','[','token',']','.'])

			const expected = [
				create_sentence_for_test([
					create_clause_token({ sub_tokens: [
						...test_tokens.slice(0, 2),
						create_clause_token({ sub_tokens: test_tokens.slice(2, 5) }),
						test_tokens[5],
						create_error_token({ token: ']', message: ERRORS.MISSING_CLOSING_BRACKET }),
					] }),
				]),
			]

			expect(clausify(test_tokens)).toEqual(expected)
		})

		test('token] => should result in an extra "[" token at the beginning with the appropriate message', () => {
			const test_tokens = create_tokens(['token',']','.'])

			const expected = [
				create_sentence_for_test([
					create_error_token({ token: '[', message: ERRORS.MISSING_OPENING_BRACKET }),
					...test_tokens,
				]),
			]

			expect(clausify(test_tokens)).toEqual(expected)
		})

		test('[token] token] => should result in an extra "[" token at the beginning with the appropriate message', () => {
			const test_tokens = create_tokens(['[','token',']','token',']','.'])

			const expected = [
				create_sentence_for_test([
					create_error_token({ token: '[', message: ERRORS.MISSING_OPENING_BRACKET }),
					create_clause_token({ sub_tokens: test_tokens.slice(0, 3) }),
					...test_tokens.slice(3, 6),
				]),
			]

			expect(clausify(test_tokens)).toEqual(expected)
		})

		test('[[[token] => should result in extra "]" tokens at the end with the appropriate message', () => {
			const test_tokens = create_tokens(['[','[','[','token',']','.'])

			const expected = [
				create_sentence_for_test([
					create_clause_token({ sub_tokens: [
						test_tokens[0],
						create_clause_token({ sub_tokens: [
							test_tokens[1],
							create_clause_token({ sub_tokens: test_tokens.slice(2, 5) }),
							test_tokens[5],
							create_error_token({ token: ']', message: ERRORS.MISSING_CLOSING_BRACKET }),
						] }),
						create_error_token({ token: ']', message: ERRORS.MISSING_CLOSING_BRACKET }),
					] }),
				]),
			]

			expect(clausify(test_tokens)).toEqual(expected)
		})

		test('[token]]] => should result in extra "[" tokens at the begining with the appropriate message', () => {
			const test_tokens = create_tokens(['[','token',']',']',']','.'])

			const expected = [
				create_sentence_for_test([
					create_error_token({ token: '[', message: ERRORS.MISSING_OPENING_BRACKET }),
					create_error_token({ token: '[', message: ERRORS.MISSING_OPENING_BRACKET }),
					create_clause_token({ sub_tokens: test_tokens.slice(0, 3) }),
					...test_tokens.slice(3, 6),
				]),
			]

			expect(clausify(test_tokens)).toEqual(expected)
		})
	})

	describe('unbalanced multiple sentence', () => {
		test('["token?" token. => should result in an extra "]" token after the first sentence', () => {
			const test_tokens = create_tokens(['[','"','token','?','"','token','.'])

			const expected = [
				create_sentence_for_test([
					create_clause_token({ sub_tokens: [
						...test_tokens.slice(0, 5),
						create_error_token({ token: ']', message: ERRORS.MISSING_CLOSING_BRACKET }),
					] }),
				]),
				create_sentence_for_test(test_tokens.slice(5, 7)),
			]

			expect(clausify(test_tokens)).toEqual(expected)
		})
		test('token. token.] => should result in an extra "[" token before the second sentence', () => {
			const test_tokens = create_tokens(['token','.','token','.',']'])

			const expected = [
				create_sentence_for_test(test_tokens.slice(0, 2)),
				create_sentence_for_test([
					create_error_token({ token: '[', message: ERRORS.MISSING_OPENING_BRACKET }),
					...test_tokens.slice(2, 5),
				]),
			]

			expect(clausify(test_tokens)).toEqual(expected)
		})
		test('[token. token.] => should result in an extra "]" and "[" tokens between sentences', () => {
			const test_tokens = create_tokens(['[','token','.','token','.',']'])

			const expected = [
				create_sentence_for_test([
					create_clause_token({ sub_tokens: [
						...test_tokens.slice(0, 3),
						create_error_token({ token: ']', message: ERRORS.MISSING_CLOSING_BRACKET }),
					] }),
				]),
				create_sentence_for_test([
					create_error_token({ token: '[', message: ERRORS.MISSING_OPENING_BRACKET }),
					...test_tokens.slice(3, 6),
				]),
			]

			expect(clausify(test_tokens)).toEqual(expected)
		})
	})
})

describe('clausify: period check', () => {
	describe('valid ending', () => {
		test('token.', () => {
			const test_tokens = create_tokens(['token', '.'])

			const expected_tokens = [create_sentence_for_test(test_tokens)]

			expect(clausify(test_tokens)).toEqual(expected_tokens)
		})
		test('token?', () => {
			const test_tokens = create_tokens(['token', '?'])

			const expected_tokens = [create_sentence_for_test(test_tokens)]

			expect(clausify(test_tokens)).toEqual(expected_tokens)
		})
		test('[token.]', () => {
			const test_tokens = create_tokens(['[', 'token', '.', ']'])

			const expected_tokens = [
				create_sentence_for_test([
					create_clause_token({ sub_tokens: test_tokens }),
				]),
			]

			expect(clausify(test_tokens)).toEqual(expected_tokens)
		})
		test('token."', () => {
			const test_tokens = create_tokens(['token', '.', '"'])

			const expected_tokens = [create_sentence_for_test(test_tokens)]

			expect(clausify(test_tokens)).toEqual(expected_tokens)
		})
		test('[token.]"', () => {
			const test_tokens = create_tokens(['[', 'token', '.', ']', '"'])

			const expected_tokens = [
				create_sentence_for_test([
					create_clause_token({ sub_tokens: test_tokens.slice(0, 4) }),
					test_tokens[4],
				]),
			]

			expect(clausify(test_tokens)).toEqual(expected_tokens)
		})
		test('token. token? token!', () => {
			const test_tokens = create_tokens(['token', '.', 'token', '?', 'token', '!'])

			const expected_tokens = [
				create_sentence_for_test(test_tokens.slice(0, 2)),
				create_sentence_for_test(test_tokens.slice(2, 4)),
				create_sentence_for_test(test_tokens.slice(4, 6)),
			]

			expect(clausify(test_tokens)).toEqual(expected_tokens)
		})
	})

	describe('missing ending', () => {
		test('token', () => {
			const test_tokens = create_tokens(['token'])

			const expected_tokens = [
				create_sentence_for_test([
					...test_tokens,
					create_error_token({ token: '.', message: ERRORS.MISSING_PERIOD }),
				]),
			]

			expect(clausify(test_tokens)).toEqual(expected_tokens)
		})
		test('token. token', () => {
			const test_tokens = create_tokens(['token', '.', 'token'])

			const expected_tokens = [
				create_sentence_for_test(test_tokens.slice(0, 2)),
				create_sentence_for_test([
					test_tokens[2],
					create_error_token({ token: '.', message: ERRORS.MISSING_PERIOD }),
				]),
			]

			expect(clausify(test_tokens)).toEqual(expected_tokens)
		})
		test('[token]', () => {
			const test_tokens = create_tokens(['[', 'token', ']'])

			const expected_tokens = [
				create_sentence_for_test([
					create_clause_token({ sub_tokens: test_tokens.slice(0, 3) }),
					create_error_token({ token: '.', message: ERRORS.MISSING_PERIOD }),
				]),
			]

			expect(clausify(test_tokens)).toEqual(expected_tokens)
		})
		test('token"', () => {
			const test_tokens = create_tokens(['token', '"'])

			const expected_tokens = [
				create_sentence_for_test([
					...test_tokens,
					create_error_token({ token: '.', message: ERRORS.MISSING_PERIOD }),
				]),
			]

			expect(clausify(test_tokens)).toEqual(expected_tokens)
		})
	})
})