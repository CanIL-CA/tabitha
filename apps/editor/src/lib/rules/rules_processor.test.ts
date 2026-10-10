import { TOKEN_TYPE, create_clause_token, create_token, flatten_sentence } from '#lib/token.js'
import { describe, expect, test } from 'vitest'
import { apply_rules } from './rules_processor'
import { LOOKUP_RULES } from './lookup_rules'
import { parse_transform_rule } from './transform_rules'
import { parse_checker_rule } from './checker_rules'
import { parse_part_of_speech_rule } from './part_of_speech_rules'
import { expect_error, create_lookup_token_for_test, create_sentence_for_test, lookup_result_for_test } from '#lib/test_helps.js'
import type { CheckerRuleJson } from '#lib/rules/types.js'

describe('transform rules', () => {
	test('trigger does not match', () => {
		const transform_rules = [
			{
				'trigger': { 'token': 'token' },
				'context': { },
				'transform': { 'type': TOKEN_TYPE.FUNCTION_WORD },
			},
		].map((rule_json, index) => parse_transform_rule({ rule_json, index }))

		const input_tokens = [
			create_sentence_for_test([
				create_token({ token: 'text', type: TOKEN_TYPE.LOOKUP_WORD }),
				create_token({ token: 'other', type: TOKEN_TYPE.LOOKUP_WORD }),
			]),
		]

		const results = apply_rules({ sentences: input_tokens, rules: transform_rules })

		expect(results).toEqual(input_tokens)
	})

	test('triggered but context does not match', () => {
		const transform_rules = [
			{
				'trigger': { 'token': 'token' },
				'context': { 'followedby': { 'token': 'other' } },
				'transform': { 'type': TOKEN_TYPE.FUNCTION_WORD },
			},
		].map((rule_json, index) => parse_transform_rule({ rule_json, index }))

		const input_tokens = [
			create_sentence_for_test([
				create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
				create_token({ token: 'text', type: TOKEN_TYPE.LOOKUP_WORD }),
			]),
		]

		const results = apply_rules({ sentences: input_tokens, rules: transform_rules })

		expect(results).toEqual(input_tokens)
	})

	test('triggered and transformed', () => {
		const transform_rules = [
			{
				'trigger': { 'token': 'peanut' },
				'context': { 'precededby': { 'token': 'a' } },
				'transform': { 'tag': { 'key': 'value' } },
			},
		].map((rule_json, index) => parse_transform_rule({ rule_json, index }))

		const input_tokens = [
			create_sentence_for_test([
				create_token({ token: 'John\'s', type: TOKEN_TYPE.LOOKUP_WORD, lookup_terms: ['John'] }),
				create_token({ token: 'peanut', type: TOKEN_TYPE.LOOKUP_WORD }),
				create_token({ token: 'was', type: TOKEN_TYPE.LOOKUP_WORD }),
				create_token({ token: 'a', type: TOKEN_TYPE.FUNCTION_WORD }),
				create_token({ token: 'peanut', type: TOKEN_TYPE.LOOKUP_WORD }),
				create_token({ token: '.', type: TOKEN_TYPE.PUNCTUATION }),
			]),
		]

		const results = apply_rules({ sentences: input_tokens, rules: transform_rules }).flatMap(flatten_sentence)

		expect(results.length).toBe(6)
		expect(results[1].tag).toEqual({})
		expect(results[4].tag).toEqual({ 'key': 'value' })
	})

	test('triggered within a subordinate clauses', () => {
		const transform_rules = [
			{
				'trigger': { 'token': 'token' },
				'context': { 'followedby': { 'token': 'context' } },
				'transform': { 'tag': { 'key': 'value' } },
			},
		].map((rule_json, index) => parse_transform_rule({ rule_json, index }))

		const input_tokens = [
			create_sentence_for_test([
				create_clause_token({ sub_tokens: [
					create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
					create_token({ token: 'context', type: TOKEN_TYPE.LOOKUP_WORD }),
				] }),
			]),
		]

		const results = apply_rules({ sentences: input_tokens, rules: transform_rules }).flatMap(flatten_sentence)

		expect(results[0].tag).toEqual({ 'key': 'value' })
	})

	test('not triggered across sentences', () => {
		const transform_rules = [
			{
				'trigger': { 'token': 'token' },
				'context': { 'followedby': { 'token': 'other', 'skip': 'all'  } },
				'transform': { 'type': TOKEN_TYPE.FUNCTION_WORD },
			},
		].map((rule_json, index) => parse_transform_rule({ rule_json, index }))

		const input_tokens = [
			create_sentence_for_test([
				create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
			]),
			create_sentence_for_test([
				create_token({ token: 'context', type: TOKEN_TYPE.LOOKUP_WORD }),
			]),
		]

		const results = apply_rules({ sentences: input_tokens, rules: transform_rules })

		expect(results).toEqual(input_tokens)
	})

	test('not triggered when context is in subordinate clauses', () => {
		const transform_rules = [
			{
				'trigger': { 'token': 'token' },
				'context': { 'followedby': { 'token': 'context', 'skip': 'all' } },
				'transform': { 'type': TOKEN_TYPE.FUNCTION_WORD },
			},
		].map((rule_json, index) => parse_transform_rule({ rule_json, index }))

		const input_tokens = [
			create_sentence_for_test([
				create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
				create_clause_token({ sub_tokens: [
					create_token({ token: 'context', type: TOKEN_TYPE.LOOKUP_WORD }),
				] }),
			]),
		]

		const results = apply_rules({ sentences: input_tokens, rules: transform_rules })

		expect(results).toEqual(input_tokens)
	})
})

describe('checker rules', () => {
	test('trigger does not match', () => {
		const rules = ([
			{
				'trigger': { 'token': 'token' },
				'context': { 'followedby': { 'token': 'context' } },
				'error': {
					'followedby': 'add',
					'message': 'message',
				},
			},
		] as CheckerRuleJson[]).map((rule_json, index) => parse_checker_rule({ rule_json, index }))

		const input_tokens = [
			create_sentence_for_test([
				create_token({ token: 'not_token', type: TOKEN_TYPE.LOOKUP_WORD }),
			]),
		]

		const output_tokens = apply_rules({ sentences: input_tokens, rules })

		expect(output_tokens).toEqual(input_tokens)
	})
	test('triggered but context does not match', () => {
		const rules = ([
			{
				'trigger': { 'token': 'token' },
				'context': { 'followedby': { 'token': 'context' } },
				'error': {
					'followedby': 'add',
					'message': 'message',
				},
			},
		] as CheckerRuleJson[]).map((rule_json, index) => parse_checker_rule({ rule_json, index }))

		const input_tokens = [
			create_sentence_for_test([
				create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
			]),
		]

		const output_tokens = apply_rules({ sentences: input_tokens, rules })

		expect(output_tokens).toEqual(input_tokens)
	})
	test('triggered with require followedby', () => {
		const rules = ([
			{
				'trigger': { 'token': 'token' },
				'context': { 'followedby': { 'token': 'context' } },
				'error': {
					'followedby': 'add',
					'message': 'message',
				},
			},
		] as CheckerRuleJson[]).map((rule_json, index) => parse_checker_rule({ rule_json, index }))

		const input_tokens = [
			create_sentence_for_test([
				create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
				create_token({ token: 'context', type: TOKEN_TYPE.LOOKUP_WORD }),
			]),
		]

		const output_tokens = apply_rules({ sentences: input_tokens, rules }).flatMap(flatten_sentence)

		expect(output_tokens.length).toBe(3)
		expect(output_tokens[0].messages.length).toBe(0)
		expect(output_tokens[1].token).toBe('add')
		expect_error({ token: output_tokens[1], message: 'message' })
		expect(output_tokens[2].messages.length).toBe(0)
	})
	test('triggered with require precededby', () => {
		const rules = ([
			{
				'trigger': { 'token': 'token' },
				'context': { 'followedby': { 'token': 'context' } },
				'error': {
					'precededby': 'add',
					'message': 'message',
				},
			},
		] as CheckerRuleJson[]).map((rule_json, index) => parse_checker_rule({ rule_json, index }))

		const input_tokens = [
			create_sentence_for_test([
				create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
				create_token({ token: 'context', type: TOKEN_TYPE.LOOKUP_WORD }),
			]),
		]

		const output_tokens = apply_rules({ sentences: input_tokens, rules }).flatMap(flatten_sentence)

		expect(output_tokens.length).toBe(3)
		expect(output_tokens[0].token).toBe('add')
		expect_error({ token: output_tokens[0], message: 'message' })
		expect(output_tokens[1].messages.length).toBe(0)
		expect(output_tokens[2].messages.length).toBe(0)
	})
	test('triggered with multiple precededby', () => {
		const rules = ([
			{
				'trigger': { 'token': 'token' },
				'context': { 'followedby': { 'token': 'context' } },
				'error': {
					'precededby': 'add1',
					'message': 'message1',
				},
			},
			{
				'trigger': { 'token': 'token' },
				'context': { 'followedby': { 'token': 'context' } },
				'error': {
					'precededby': 'add2',
					'message': 'message2',
				},
			},
		] as CheckerRuleJson[]).map((rule_json, index) => parse_checker_rule({ rule_json, index }))

		const input_tokens = [
			create_sentence_for_test([
				create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
				create_token({ token: 'context', type: TOKEN_TYPE.LOOKUP_WORD }),
			]),
		]

		const output_tokens = apply_rules({ sentences: input_tokens, rules }).flatMap(flatten_sentence)

		expect(output_tokens.length).toBe(4)
		expect(output_tokens[0].token).toBe('add1')
		expect_error({ token: output_tokens[0], message: 'message1' })
		expect(output_tokens[1].token).toBe('add2')
		expect_error({ token: output_tokens[1], message: 'message2' })
		expect(output_tokens[2].messages.length).toBe(0)
		expect(output_tokens[3].messages.length).toBe(0)
	})
	test('triggered with message on trigger', () => {
		const rules = ([
			{
				'trigger': { 'token': 'token' },
				'context': { 'followedby': { 'token': 'context' } },
				'error': { 'message': 'message' },
			},
		] as CheckerRuleJson[]).map((rule_json, index) => parse_checker_rule({ rule_json, index }))

		const input_tokens = [
			create_sentence_for_test([
				create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
				create_token({ token: 'context', type: TOKEN_TYPE.LOOKUP_WORD }),
			]),
		]

		const output_tokens = apply_rules({ sentences: input_tokens, rules }).flatMap(flatten_sentence)

		expect(output_tokens.length).toBe(2)
		expect(output_tokens[0].token).toBe('token')
		expect_error({ token: output_tokens[0], message: 'message' })
		expect(output_tokens[1].messages.length).toBe(0)
	})
	test('not triggered across sentences', () => {
		const rules = ([
			{
				'trigger': { 'token': 'token' },
				'context': { 'followedby': { 'token': 'context', 'skip': 'all' } },
				'error': {
					'followedby': 'add',
					'message': 'message',
				},
			},
		] as CheckerRuleJson[]).map((rule_json, index) => parse_checker_rule({ rule_json, index }))

		const input_tokens = [
			create_sentence_for_test([
				create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
			]),
			create_sentence_for_test([
				create_token({ token: 'context', type: TOKEN_TYPE.LOOKUP_WORD }),
			]),
		]

		const output_tokens = apply_rules({ sentences: input_tokens, rules })

		expect(output_tokens).toEqual(input_tokens)
	})
	test('context not triggered from within subordinate clauses', () => {
		const rules = ([
			{
				'trigger': { 'token': 'token' },
				'context': { 'followedby': { 'token': 'context', 'skip': 'all' } },
				'error': {
					'followedby': 'add',
					'message': 'message',
				},
			},
		] as CheckerRuleJson[]).map((rule_json, index) => parse_checker_rule({ rule_json, index }))

		const input_tokens = [
			create_sentence_for_test([
				create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
				create_clause_token({ sub_tokens: [
					create_token({ token: 'context', type: TOKEN_TYPE.LOOKUP_WORD }),
				] }),
			]),
		]

		const output_tokens = apply_rules({ sentences: input_tokens, rules })

		expect(output_tokens).toEqual(input_tokens)
	})

	test('triggered within a subordinate clauses', () => {
		const rules = ([
			{
				'trigger': { 'token': 'token' },
				'context': { 'followedby': { 'token': 'context' } },
				'error': {
					'followedby': 'add',
					'message': 'message',
				},
			},
		] as CheckerRuleJson[]).map((rule_json, index) => parse_checker_rule({ rule_json, index }))

		const input_tokens = [
			create_sentence_for_test([
				create_clause_token({ sub_tokens: [
					create_token({ token: 'token', type: TOKEN_TYPE.LOOKUP_WORD }),
					create_token({ token: 'context', type: TOKEN_TYPE.LOOKUP_WORD }),
				] }),
			]),
		]

		const results = apply_rules({ sentences: input_tokens, rules }).flatMap(flatten_sentence)

		expect(results.length).toBe(3)
		expect(results[1].token).toBe('add')
		expect_error({ token: results[1], message: 'message' })
	})
})

describe('lookup rules', () => {
	test('built-in lookup rules', () => {
		const input_tokens = [
			create_sentence_for_test([
				create_token({ token: 'John', type: TOKEN_TYPE.LOOKUP_WORD }),
				create_token({ token: 'ran', type: TOKEN_TYPE.LOOKUP_WORD, lookup_terms: ['run'] }),
				create_clause_token({ sub_tokens: [
					create_token({ token: '[', type: TOKEN_TYPE.PUNCTUATION }),
					create_token({ token: 'in', type: TOKEN_TYPE.LOOKUP_WORD }),
					create_token({ token: 'order', type: TOKEN_TYPE.LOOKUP_WORD }),
					create_token({ token: 'to', type: TOKEN_TYPE.LOOKUP_WORD }),
					create_token({ token: 'take', type: TOKEN_TYPE.LOOKUP_WORD }),
					create_token({ token: 'many', type: TOKEN_TYPE.LOOKUP_WORD }),
					create_token({ token: 'books', type: TOKEN_TYPE.LOOKUP_WORD }),
					create_token({ token: 'away', type: TOKEN_TYPE.LOOKUP_WORD }),
					create_token({ token: ']', type: TOKEN_TYPE.PUNCTUATION }),
				] }),
				create_token({ token: '.', type: TOKEN_TYPE.PUNCTUATION }),
			]),
		]
		const results = apply_rules({ sentences: input_tokens, rules: LOOKUP_RULES }).flatMap(flatten_sentence)

		expect(results[0].token).toBe('John')
		expect(results[0].messages.length).toBe(0)
		expect(results[1].token).toBe('ran')
		expect(results[1].messages.length).toBe(0)
		expect(results[2].token).toBe('[')
		expect(results[2].messages.length).toBe(0)
		expect(results[3].token).toBe('in order to')
		expect(results[3].lookup_terms[0]).toBe('in-order-to')
		expect(results[3].messages.length).toBe(0)
		expect(results[4].token).toBe('take')
		expect(results[4].messages.length).toBe(0)
		expect(results[5].token).toBe('many')
		expect(results[5].lookup_terms[0]).toBe('much-many')
		expect(results[5].messages.length).toBe(0)
		expect(results[6].token).toBe('books')
		expect(results[6].messages.length).toBe(0)
		expect(results[7].token).toBe('away')
		expect(results[7].messages.length).toBe(0)
		expect(results[8].token).toBe(']')
		expect(results[8].messages.length).toBe(0)
		expect(results[9].token).toBe('.')
		expect(results[9].messages.length).toBe(0)
		expect(results).length(10)
	})
})

describe('part-of-speech rules', () => {
	test('word does not match any parts of speech', () => {
		const rules = [
			{
				'category': 'Noun|Verb',
				'context': {},
				'remove': 'Noun',
			},
		].map((rule_json, index) => parse_part_of_speech_rule({ rule_json, index }))

		const input_tokens = [
			create_sentence_for_test([
				create_lookup_token_for_test({
					token: 'token',
					lookup_results: [
						lookup_result_for_test({ stem: 'token', part_of_speech: 'Adjective' }),
					],
				}),
			]),
		]

		const results = apply_rules({ sentences: input_tokens, rules })

		expect(results).toEqual(input_tokens)
	})
	test('word matches only one part of speech', () => {
		const rules = [
			{
				'category': 'Noun|Verb',
				'context': {},
				'remove': 'Noun',
			},
		].map((rule_json, index) => parse_part_of_speech_rule({ rule_json, index }))

		const input_tokens = [
			create_sentence_for_test([
				create_lookup_token_for_test({
					token: 'token',
					lookup_results: [
						lookup_result_for_test({ stem: 'token1', part_of_speech: 'Noun' }),
						lookup_result_for_test({ stem: 'token2', part_of_speech: 'Noun' }),
					],
				}),
			]),
		]

		const results = apply_rules({ sentences: input_tokens, rules })

		expect(results).toEqual(input_tokens)
	})
	test('word matches both parts of speech', () => {
		const rules = [
			{
				'category': 'Noun|Verb',
				'context': {},
				'remove': 'Noun',
			},
		].map((rule_json, index) => parse_part_of_speech_rule({ rule_json, index }))

		const input_tokens = [
			create_sentence_for_test([
				create_lookup_token_for_test({
					token: 'token',
					lookup_results: [
						lookup_result_for_test({ stem: 'token1', part_of_speech: 'Noun' }),
						lookup_result_for_test({ stem: 'token2', part_of_speech: 'Noun' }),
						lookup_result_for_test({ stem: 'token1', part_of_speech: 'Verb' }),
						lookup_result_for_test({ stem: 'token2', part_of_speech: 'Verb' }),
					],
				}),
			]),
		]

		const results = apply_rules({ sentences: input_tokens, rules }).flatMap(flatten_sentence)

		expect(results[0].messages.length).toBe(0)
		expect(results[0].lookup_results.length).toBe(2)
		expect(results[0].lookup_results[0].part_of_speech).toBe('Verb')
	})
	test('word matches both parts of speech, but has three', () => {
		const rules = [
			{
				'category': 'Noun|Verb',
				'context': {},
				'remove': 'Noun',
			},
		].map((rule_json, index) => parse_part_of_speech_rule({ rule_json, index }))

		const input_tokens = [
			create_sentence_for_test([
				create_lookup_token_for_test({
					token: 'token',
					lookup_results: [
						lookup_result_for_test({ stem: 'token1', part_of_speech: 'Noun' }),
						lookup_result_for_test({ stem: 'token2', part_of_speech: 'Noun' }),
						lookup_result_for_test({ stem: 'token1', part_of_speech: 'Verb' }),
						lookup_result_for_test({ stem: 'token2', part_of_speech: 'Verb' }),
						lookup_result_for_test({ stem: 'token1', part_of_speech: 'Adjective' }),
					],
				}),
			]),
		]

		const results = apply_rules({ sentences: input_tokens, rules }).flatMap(flatten_sentence)

		expect(results[0].messages.length).toBe(0)
		expect(results[0].lookup_results.length).toBe(3)
		expect(results[0].lookup_results[0].part_of_speech).toBe('Verb')
		expect(results[0].lookup_results[1].part_of_speech).toBe('Verb')
		expect(results[0].lookup_results[2].part_of_speech).toBe('Adjective')
	})
})