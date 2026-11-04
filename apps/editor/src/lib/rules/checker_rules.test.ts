import { TOKEN_TYPE, create_token, flatten_sentence } from '../token'
import { ERRORS } from '../parser/error_messages'
import { apply_rules } from './rules_processor'
import { describe, expect, test } from 'vitest'
import { CHECKER_RULES } from './checker_rules'
import {
	expect_error,
	expect_error_to_match,
	expect_message_to_match,
	expect_no_message,
	create_lookup_token_for_test,
	create_pairing_token_for_test,
	create_sentence_for_test,
	lookup_result_for_test,
} from '#lib/test_helps.js'
import type { Token } from '#lib/types.js'

describe('built-in checker rules', () => {
	describe('sentence capitalization', () => {
		const CAPITALIZATION_RULE = CHECKER_RULES.slice(0, 1)

		test('valid', () => {
			const test_tokens = [create_sentence_for_test([
				create_lookup_token_for_test({ token: 'Token', tag: { 'position': 'first_word' } }),
				create_pairing_token_for_test({
					left: create_lookup_token_for_test({ token: 'First', tag: { 'position': 'first_word' } }),
					right: create_lookup_token_for_test({ token: 'second' }),
				}),
				create_token({ token: 'Function', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'position': 'first_word' } }),
				create_token({ token: 'name', type: TOKEN_TYPE.LOOKUP_WORD, tag: { 'position': 'first_word' }, pronoun: create_token({ token: 'You', type: TOKEN_TYPE.FUNCTION_WORD }) }),
			])]

			const checked_tokens = apply_rules({ sentences: test_tokens, rules: CAPITALIZATION_RULE })

			expect(checked_tokens).toEqual(test_tokens)
		})

		test('invalid', () => {
			const test_tokens = [create_sentence_for_test([
				create_lookup_token_for_test({ token: 'token', tag: { 'position': 'first_word' } }),
				create_pairing_token_for_test({
					left: create_lookup_token_for_test({ token: 'first', tag: { 'position': 'first_word' } }),
					right: create_lookup_token_for_test({ token: 'second' }),
				}),
				create_token({ token: 'function', type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'position': 'first_word' } }),
				create_token({ token: 'name', type: TOKEN_TYPE.LOOKUP_WORD, tag: { 'position': 'first_word' }, pronoun: create_token({ token: 'you', type: TOKEN_TYPE.FUNCTION_WORD }) }),
			])]

			const checked_tokens = apply_rules({ sentences: test_tokens, rules: CAPITALIZATION_RULE }).flatMap(flatten_sentence)

			expect_error({ token: checked_tokens[0], message: ERRORS.FIRST_WORD_NOT_CAPITALIZED })
			expect_error({ token: checked_tokens[1], message: ERRORS.FIRST_WORD_NOT_CAPITALIZED })
			expect_error({ token: checked_tokens[2], message: ERRORS.FIRST_WORD_NOT_CAPITALIZED })
			expect_error({ token: checked_tokens[3].pronoun, message: ERRORS.FIRST_WORD_NOT_CAPITALIZED })
		})
	})

	describe('complexity level check', () => {
		const LEVEL_CHECK_RULES = CHECKER_RULES.slice(4, 6)

		test('different levels', () => {
			const test_tokens = [create_sentence_for_test([
				create_lookup_token_for_test({ token: 'token0', lookup_results: [lookup_result_for_test({ stem: 'token0', level: 0 })] }),
				create_lookup_token_for_test({ token: 'token1', lookup_results: [lookup_result_for_test({ stem: 'token1', level: 1 })] }),
				create_lookup_token_for_test({ token: 'token2', lookup_results: [lookup_result_for_test({ stem: 'token2', level: 2 })] }),
				create_lookup_token_for_test({ token: 'token3', lookup_results: [lookup_result_for_test({ stem: 'token3', level: 3 })] }),
				create_lookup_token_for_test({ token: 'token4', lookup_results: [lookup_result_for_test({ stem: 'token4', level: 4 })] }),
			])]
	
			const checked_tokens = apply_rules({ sentences: test_tokens, rules: LEVEL_CHECK_RULES }).flatMap(flatten_sentence)
	
			expect_no_message(checked_tokens[0])
			expect_no_message(checked_tokens[1])
			expect_error({ token: checked_tokens[2], message: ERRORS.WORD_LEVEL_TOO_HIGH })
			expect_error({ token: checked_tokens[3], message: ERRORS.WORD_LEVEL_TOO_HIGH })
			expect_no_message(checked_tokens[4])
		})
		test('pairing: both words right level', () => {
			const test_tokens = [create_sentence_for_test([
				create_pairing_token_for_test({
					left: create_lookup_token_for_test({ token: 'first', lookup_results: [lookup_result_for_test({ stem: 'first', level: 0 })] }),
					right: create_lookup_token_for_test({ token: 'second', lookup_results: [lookup_result_for_test({ stem: 'second', level: 2 })] }),
					pairing_type: 'simple-complex',
				}),
				create_pairing_token_for_test({
					left: create_lookup_token_for_test({ token: 'first', lookup_results: [lookup_result_for_test({ stem: 'first', level: 1 })] }),
					right: create_lookup_token_for_test({ token: 'second', lookup_results: [lookup_result_for_test({ stem: 'second', level: 3 })] }),
					pairing_type: 'simple-complex',
				}),
				create_pairing_token_for_test({
					left: create_lookup_token_for_test({ token: 'first', lookup_results: [lookup_result_for_test({ stem: 'first', level: 1 })] }),
					right: create_lookup_token_for_test({ token: 'second', lookup_results: [lookup_result_for_test({ stem: 'second', level: 1 })] }),
					pairing_type: 'dynamic-literal',
				}),
			])]
	
			const checked_tokens = apply_rules({ sentences: test_tokens, rules: LEVEL_CHECK_RULES })
	
			expect(checked_tokens).toEqual(test_tokens)
		})
		test('pairing: level 4 words are valid for both', () => {
			const test_tokens = [create_sentence_for_test([
				create_pairing_token_for_test({
					left: create_lookup_token_for_test({ token: 'first', lookup_results: [lookup_result_for_test({ stem: 'first', level: 4 })] }),
					right: create_lookup_token_for_test({ token: 'second', lookup_results: [lookup_result_for_test({ stem: 'second', level: 4 })] }),
				}),
			])]
	
			const checked_tokens = apply_rules({ sentences: test_tokens, rules: LEVEL_CHECK_RULES })
	
			expect(checked_tokens).toEqual(test_tokens)
		})
		test('pairing: first word wrong level', () => {
			const test_tokens = [create_sentence_for_test([
				create_pairing_token_for_test({
					left: create_lookup_token_for_test({ token: 'first', lookup_results: [lookup_result_for_test({ stem: 'first', level: 2 })] }),
					right: create_lookup_token_for_test({ token: 'second', lookup_results: [lookup_result_for_test({ stem: 'second', level: 2 })] }),
				}),
				create_pairing_token_for_test({
					left: create_lookup_token_for_test({ token: 'first', lookup_results: [lookup_result_for_test({ stem: 'first', level: 3 })] }),
					right: create_lookup_token_for_test({ token: 'second', lookup_results: [lookup_result_for_test({ stem: 'second', level: 3 })] }),
				}),
				create_pairing_token_for_test({
					left: create_lookup_token_for_test({ token: 'first', lookup_results: [lookup_result_for_test({ stem: 'first', level: 3 })] }),
					right: create_lookup_token_for_test({ token: 'second', lookup_results: [lookup_result_for_test({ stem: 'second', level: 1 })] }),
					pairing_type: 'dynamic-literal',
				}),
			])]
	
			const checked_tokens = apply_rules({ sentences: test_tokens, rules: LEVEL_CHECK_RULES }).flatMap(flatten_sentence)
	
			expect_error({ token: checked_tokens[0], message: ERRORS.WORD_LEVEL_TOO_HIGH })
			expect_no_message(checked_tokens[0].pairing)
			expect_error({ token: checked_tokens[1], message: ERRORS.WORD_LEVEL_TOO_HIGH })
			expect_no_message(checked_tokens[1].pairing)
			expect_error({ token: checked_tokens[2], message: ERRORS.WORD_LEVEL_TOO_HIGH })
			expect_no_message(checked_tokens[2].pairing)
		})
		test('pairing: second word wrong level', () => {
			const test_tokens = [create_sentence_for_test([
				create_pairing_token_for_test({
					left: create_lookup_token_for_test({ token: 'first', lookup_results: [lookup_result_for_test({ stem: 'first', level: 0 })] }),
					right: create_lookup_token_for_test({ token: 'second', lookup_results: [lookup_result_for_test({ stem: 'second', level: 0 })] }),
				}),
				create_pairing_token_for_test({
					left: create_lookup_token_for_test({ token: 'first', lookup_results: [lookup_result_for_test({ stem: 'first', level: 1 })] }),
					right: create_lookup_token_for_test({ token: 'second', lookup_results: [lookup_result_for_test({ stem: 'second', level: 1 })] }),
				}),
				create_pairing_token_for_test({
					left: create_lookup_token_for_test({ token: 'first', lookup_results: [lookup_result_for_test({ stem: 'first', level: 1 })] }),
					right: create_lookup_token_for_test({ token: 'second', lookup_results: [lookup_result_for_test({ stem: 'second', level: 2 })] }),
					pairing_type: 'dynamic-literal',
				}),
			])]
	
			const checked_tokens = apply_rules({ sentences: test_tokens, rules: LEVEL_CHECK_RULES }).flatMap(flatten_sentence)
	
			expect_no_message(checked_tokens[0])
			expect_error({ token: checked_tokens[0].pairing, message: ERRORS.WORD_LEVEL_TOO_LOW })
			expect_no_message(checked_tokens[1])
			expect_error({ token: checked_tokens[1].pairing, message: ERRORS.WORD_LEVEL_TOO_LOW })
			expect_no_message(checked_tokens[2])
			expect_error({ token: checked_tokens[2].pairing, message: ERRORS.WORD_LEVEL_TOO_HIGH })
		})
		test('pairing: both words wrong level', () => {
			const test_tokens = [create_sentence_for_test([
				create_pairing_token_for_test({
					left: create_lookup_token_for_test({ token: 'first', lookup_results: [lookup_result_for_test({ stem: 'first', level: 2 })] }),
					right: create_lookup_token_for_test({ token: 'second', lookup_results: [lookup_result_for_test({ stem: 'second', level: 0 })] }),
				}),
				create_pairing_token_for_test({
					left: create_lookup_token_for_test({ token: 'first', lookup_results: [lookup_result_for_test({ stem: 'first', level: 3 })] }),
					right: create_lookup_token_for_test({ token: 'second', lookup_results: [lookup_result_for_test({ stem: 'second', level: 1 })] }),
				}),
				create_pairing_token_for_test({
					left: create_lookup_token_for_test({ token: 'first', lookup_results: [lookup_result_for_test({ stem: 'first', level: 3 })] }),
					right: create_lookup_token_for_test({ token: 'second', lookup_results: [lookup_result_for_test({ stem: 'second', level: 2 })] }),
					pairing_type: 'dynamic-literal',
				}),
			])]
	
			const checked_tokens = apply_rules({ sentences: test_tokens, rules: LEVEL_CHECK_RULES }).flatMap(flatten_sentence)
	
			expect_error({ token: checked_tokens[0], message: ERRORS.WORD_LEVEL_TOO_HIGH })
			expect_error({ token: checked_tokens[0].pairing, message: ERRORS.WORD_LEVEL_TOO_LOW })
			expect_error({ token: checked_tokens[1], message: ERRORS.WORD_LEVEL_TOO_HIGH })
			expect_error({ token: checked_tokens[1].pairing, message: ERRORS.WORD_LEVEL_TOO_LOW })
			expect_error({ token: checked_tokens[2], message: ERRORS.WORD_LEVEL_TOO_HIGH })
			expect_error({ token: checked_tokens[2].pairing, message: ERRORS.WORD_LEVEL_TOO_HIGH })
		})
	})
	
	describe('ambiguous level check', () => {
		const AMBIGUOUS_LEVEL_CHECK = CHECKER_RULES.slice(6, 7)

		test('main token level check', () => {
			const test_tokens = [create_sentence_for_test([
				create_lookup_token_for_test({ token: 'token', lookup_results: [] }),
				create_lookup_token_for_test({ token: 'token', lookup_results: [
					lookup_result_for_test({ stem: 'token', level: 1 }),
					lookup_result_for_test({ stem: 'token2', level: 2 }),
				] }),
				create_lookup_token_for_test({ token: 'token', lookup_results: [
					lookup_result_for_test({ stem: 'token', level: 1 }),
					lookup_result_for_test({ stem: 'token4', level: 4 }),
				] }),
				create_lookup_token_for_test({ token: 'token', lookup_results: [
					lookup_result_for_test({ stem: 'token', level: 2 }),
					lookup_result_for_test({ stem: 'token1', level: 1 }),
				] }),
			])]

			const checked_tokens = apply_rules({ sentences: test_tokens, rules: AMBIGUOUS_LEVEL_CHECK }).flatMap(flatten_sentence)

			expect_no_message(checked_tokens[0])
			expect_no_message(checked_tokens[1])
			expect_no_message(checked_tokens[2])
			expect_message_to_match({ token: checked_tokens[3], message_type: 'warning', regex: /^This word has multiple senses/ })
		})
		test('complex pairing level check', () => {
			const test_tokens = [create_sentence_for_test([
				create_pairing_token_for_test({
					left: create_lookup_token_for_test({ token: 'first', lookup_results: [lookup_result_for_test({ stem: 'first', level: 1 })] }),
					right: create_lookup_token_for_test({ token: 'second', lookup_results: [] }),
				}),
				create_pairing_token_for_test({
					left: create_lookup_token_for_test({ token: 'first', lookup_results: [lookup_result_for_test({ stem: 'first', level: 1 })] }),
					right: create_lookup_token_for_test({ token: 'second', lookup_results: [
						lookup_result_for_test({ stem: 'second', level: 2 }),
						lookup_result_for_test({ stem: 'second1', level: 1 }),
					] }),
				}),
				create_pairing_token_for_test({
					left: create_lookup_token_for_test({ token: 'first', lookup_results: [lookup_result_for_test({ stem: 'first', level: 1 })] }),
					right: create_lookup_token_for_test({ token: 'second', lookup_results: [
						lookup_result_for_test({ stem: 'second', level: 2 }),
						lookup_result_for_test({ stem: 'second1', level: 4 }),
					] }),
				}),
				create_pairing_token_for_test({
					left: create_lookup_token_for_test({ token: 'first', lookup_results: [lookup_result_for_test({ stem: 'first', level: 1 })] }),
					right: create_lookup_token_for_test({ token: 'second', lookup_results: [
						lookup_result_for_test({ stem: 'second', level: 1 }),
						lookup_result_for_test({ stem: 'second2', level: 2 }),
					] }),
				}),
			])]
	
			const checked_tokens = apply_rules({ sentences: test_tokens, rules: AMBIGUOUS_LEVEL_CHECK }).flatMap(flatten_sentence)
	
			expect_no_message(checked_tokens[0])
			expect_no_message(checked_tokens[1])
			expect_no_message(checked_tokens[2])
			expect_message_to_match({ token: checked_tokens[3].pairing, message_type: 'warning', regex: /^This word has multiple senses/ })
		})
	})
	
	describe('no lookup check', () => {
		const NO_LOOKUP_CHECK = CHECKER_RULES.slice(7, 8)

		test('no results, lookup error', () => {
			const test_tokens = [create_sentence_for_test([
				create_lookup_token_for_test({ token: 'token' }),
				create_pairing_token_for_test({
					left: create_lookup_token_for_test({ token: 'first' }),
					right: create_lookup_token_for_test({ token: 'second' }),
				}),
			])]
	
			const checked_tokens = apply_rules({ sentences: test_tokens, rules: NO_LOOKUP_CHECK }).flatMap(flatten_sentence)

			expect_message_to_match({ token: checked_tokens[0], message_type: 'warning', regex: /^'token' is not recognized/ })
			expect_message_to_match({ token: checked_tokens[1], message_type: 'warning', regex: /^'first' is not recognized/ })
			expect_message_to_match({ token: checked_tokens[1].pairing, message_type: 'warning', regex: /^'second' is not recognized/ })
		})
	})

	describe('temporal phrase comma suggestion', () => {
		test('suggests comma after temporal phrase One morning that man', () => {
			const test_tokens = [create_sentence_for_test([
				create_token({ token: 'One', type: TOKEN_TYPE.FUNCTION_WORD }),
				create_lookup_token_for_test({ token: 'morning', lookup_results: [lookup_result_for_test({ stem: 'morning' })] }),
				create_token({ token: 'that', type: TOKEN_TYPE.FUNCTION_WORD }),
				create_lookup_token_for_test({ token: 'man', lookup_results: [lookup_result_for_test({ stem: 'man', part_of_speech: 'Noun' })] }),
				create_token({ token: '.', type: TOKEN_TYPE.PUNCTUATION }),
			])]
			const ONE_DAY_RULE = CHECKER_RULES.filter(r => r.name.includes('Suggest a comma after'))
			const checked_tokens = apply_rules({ sentences: test_tokens, rules: ONE_DAY_RULE }).flatMap(flatten_sentence)
			const comma_token = checked_tokens.find(t => t.token === ',')
			expect(comma_token?.messages.some(m => m.message.includes("Add a comma after 'One morning'"))).toBe(true)
		})
	})
})

describe('Adjective used as a Noun after a determiner', () => {
	const ADJECTIVE_AS_NOUN_RULE = CHECKER_RULES.filter(rule => rule.name === 'Check for an Adjective used as a Noun after a determiner')

	const create_word_token = ({ token, stem, part_of_speech }: { token: string, stem: string, part_of_speech: 'Noun' | 'Verb' | 'Adjective' }) =>
		create_lookup_token_for_test({ token, lookup_results: [lookup_result_for_test({ stem, part_of_speech })] })
	const create_predicative_adjective_token = ({ token, stem }: { token: string, stem: string }) =>
		create_lookup_token_for_test({ token, tag: { 'adj_usage': 'predicative' }, lookup_results: [lookup_result_for_test({ stem, part_of_speech: 'Adjective' })] })
	const create_article_token = (token: string) => create_token({ token, type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'determiner': 'definite_article' } })
	const create_function_word_token = (token: string) => create_token({ token, type: TOKEN_TYPE.FUNCTION_WORD })
	const create_period_token = () => create_token({ token: '.', type: TOKEN_TYPE.PUNCTUATION })
	const check = (tokens: Token[]) => apply_rules({ sentences: [create_sentence_for_test(tokens)], rules: ADJECTIVE_AS_NOUN_RULE }).flatMap(flatten_sentence)

	test('flags an Adjective at the end of a sentence: God raised Jesus from the dead. (cf. Romans 10:9)', () => {
		const checked_tokens = check([
			create_word_token({ token: 'God', stem: 'God', part_of_speech: 'Noun' }),
			create_word_token({ token: 'raised', stem: 'raise', part_of_speech: 'Verb' }),
			create_word_token({ token: 'Jesus', stem: 'Jesus', part_of_speech: 'Noun' }),
			create_function_word_token('from'),
			create_article_token('the'),
			create_predicative_adjective_token({ token: 'dead', stem: 'dead' }),
			create_period_token(),
		])

		expect_error_to_match({ token: checked_tokens[5], regex: /^An Adjective cannot be used as a Noun/ })
	})
	test('does not flag an Adjective that is not predicative: God raised Jesus from the dead. (cf. Romans 10:9)', () => {
		const checked_tokens = check([
			create_word_token({ token: 'God', stem: 'God', part_of_speech: 'Noun' }),
			create_word_token({ token: 'raised', stem: 'raise', part_of_speech: 'Verb' }),
			create_word_token({ token: 'Jesus', stem: 'Jesus', part_of_speech: 'Noun' }),
			create_function_word_token('from'),
			create_article_token('the'),
			create_word_token({ token: 'dead', stem: 'dead', part_of_speech: 'Adjective' }),
			create_period_token(),
		])

		expect_no_message(checked_tokens[5])
	})
	test('flags an Adjective before a relative clause: The one who believes will live. (cf. John 11:25)', () => {
		const checked_tokens = check([
			create_article_token('The'),
			create_predicative_adjective_token({ token: 'one', stem: 'one' }),
			create_function_word_token('who'),
			create_word_token({ token: 'believes', stem: 'believe', part_of_speech: 'Verb' }),
			create_function_word_token('will'),
			create_word_token({ token: 'live', stem: 'live', part_of_speech: 'Verb' }),
			create_period_token(),
		])

		expect_error_to_match({ token: checked_tokens[1], regex: /^An Adjective cannot be used as a Noun/ })
	})
	test('does not flag an Adjective followed by its Noun: God loves the poor people.', () => {
		const checked_tokens = check([
			create_word_token({ token: 'God', stem: 'God', part_of_speech: 'Noun' }),
			create_word_token({ token: 'loves', stem: 'love', part_of_speech: 'Verb' }),
			create_article_token('the'),
			create_word_token({ token: 'poor', stem: 'poor', part_of_speech: 'Adjective' }),
			create_word_token({ token: 'people', stem: 'people', part_of_speech: 'Noun' }),
			create_period_token(),
		])

		expect_no_message(checked_tokens[3])
	})
	test('does not flag "the same": Both corners should be the same. (cf. Exodus 26:24)', () => {
		const checked_tokens = check([
			create_function_word_token('Both'),
			create_word_token({ token: 'corners', stem: 'corner', part_of_speech: 'Noun' }),
			create_function_word_token('should'),
			create_word_token({ token: 'be', stem: 'be', part_of_speech: 'Verb' }),
			create_article_token('the'),
			create_predicative_adjective_token({ token: 'same', stem: 'same' }),
			create_period_token(),
		])

		expect_no_message(checked_tokens[5])
	})
	test('does not flag a predicate Adjective: Their idols are silver. (Psalm 115:4)', () => {
		const checked_tokens = check([
			create_function_word_token('Their'),
			create_word_token({ token: 'idols', stem: 'idol', part_of_speech: 'Noun' }),
			create_word_token({ token: 'are', stem: 'be', part_of_speech: 'Verb' }),
			create_word_token({ token: 'silver', stem: 'silver', part_of_speech: 'Adjective' }),
			create_period_token(),
		])

		expect_no_message(checked_tokens[3])
	})
})

describe('Repeat the adposition before a coordinated noun', () => {
	const REPEAT_ADPOSITION_RULE = CHECKER_RULES.filter(rule => rule.name === 'Repeat the adposition before a coordinated noun')

	const create_noun_token = ({ token, has_adposition, coordinate }: { token: string, has_adposition: 'yes' | 'no', coordinate?: 'first' | 'coordinate' | 'last' | 'no_partner' }) =>
		create_lookup_token_for_test({ token, tag: { has_adposition, ...coordinate ? { coordinate } : {} }, lookup_results: [lookup_result_for_test({ stem: token, part_of_speech: 'Noun' })] })
	const create_verb_token = (token: string) => create_lookup_token_for_test({ token, lookup_results: [lookup_result_for_test({ stem: token, part_of_speech: 'Verb' })] })
	const create_adposition_token = (token: string) => create_token({ token, type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'pre_np_adposition': 'verb_argument' } })
	const create_conjunction_token = () => create_token({ token: 'and', type: TOKEN_TYPE.LOOKUP_WORD, tag: { 'syntax': 'coord_noun' } })
	const create_list_comma_token = () => create_token({ token: ',', type: TOKEN_TYPE.PUNCTUATION, tag: { 'syntax': 'comma', 'list_comma': 'np' } })
	const create_period_token = () => create_token({ token: '.', type: TOKEN_TYPE.PUNCTUATION })
	const check = (tokens: Token[]) => apply_rules({ sentences: [create_sentence_for_test(tokens)], rules: REPEAT_ADPOSITION_RULE }).flatMap(flatten_sentence)

	test('flags a noun that is not coordinated with anything: John went to Jerusalem and Bethlehem.', () => {
		const checked_tokens = check([
			create_noun_token({ token: 'John', has_adposition: 'no' }),
			create_verb_token('went'),
			create_adposition_token('to'),
			create_noun_token({ token: 'Jerusalem', has_adposition: 'yes' }),
			create_conjunction_token(),
			create_noun_token({ token: 'Bethlehem', has_adposition: 'no', coordinate: 'no_partner' }),
			create_period_token(),
		])

		expect_message_to_match({ token: checked_tokens[5], message_type: 'warning', regex: /^The adposition must be repeated before 'Bethlehem'/ })
	})
	test('flags a noun with a different adposition than the noun before the coordinator: John went to the house of James and in the store.', () => {
		const checked_tokens = check([
			create_noun_token({ token: 'John', has_adposition: 'no', coordinate: 'no_partner' }),
			create_verb_token('went'),
			create_adposition_token('to'),
			create_noun_token({ token: 'house', has_adposition: 'yes', coordinate: 'no_partner' }),
			create_adposition_token('of'),
			create_noun_token({ token: 'James', has_adposition: 'yes', coordinate: 'no_partner' }),
			create_conjunction_token(),
			create_adposition_token('in'),
			create_noun_token({ token: 'store', has_adposition: 'yes', coordinate: 'no_partner' }),
			create_period_token(),
		])

		expect_message_to_match({ token: checked_tokens[8], message_type: 'warning', regex: /^The adposition should be repeated before 'store'/ })
	})
	test('flags the first noun of a coordinated list that is missing the adposition: John went to Jerusalem, Bethlehem and Hebron.', () => {
		const checked_tokens = check([
			create_noun_token({ token: 'John', has_adposition: 'no' }),
			create_verb_token('went'),
			create_adposition_token('to'),
			create_noun_token({ token: 'Jerusalem', has_adposition: 'yes' }),
			create_list_comma_token(),
			create_noun_token({ token: 'Bethlehem', has_adposition: 'no', coordinate: 'first' }),
			create_conjunction_token(),
			create_noun_token({ token: 'Hebron', has_adposition: 'no', coordinate: 'last' }),
			create_period_token(),
		])

		expect_message_to_match({ token: checked_tokens[5], message_type: 'warning', regex: /^The adposition should be repeated before 'Bethlehem'/ })
		expect_no_message(checked_tokens[7])
	})
	test('does not flag a noun that repeats the adposition: John went to Jerusalem and to Bethlehem.', () => {
		const checked_tokens = check([
			create_noun_token({ token: 'John', has_adposition: 'no' }),
			create_verb_token('went'),
			create_adposition_token('to'),
			create_noun_token({ token: 'Jerusalem', has_adposition: 'yes', coordinate: 'first' }),
			create_conjunction_token(),
			create_adposition_token('to'),
			create_noun_token({ token: 'Bethlehem', has_adposition: 'yes', coordinate: 'last' }),
			create_period_token(),
		])

		expect_no_message(checked_tokens[6])
	})
	test('does not flag a noun coordinated with the noun the adposition phrase belongs to: The brother of James and John went.', () => {
		const checked_tokens = check([
			create_noun_token({ token: 'brother', has_adposition: 'no', coordinate: 'first' }),
			create_adposition_token('of'),
			create_noun_token({ token: 'James', has_adposition: 'yes' }),
			create_conjunction_token(),
			create_noun_token({ token: 'John', has_adposition: 'no', coordinate: 'last' }),
			create_verb_token('went'),
			create_period_token(),
		])

		expect_no_message(checked_tokens[4])
	})
	test('does not flag coordinated nouns without any adposition: John and Mary went.', () => {
		const checked_tokens = check([
			create_noun_token({ token: 'John', has_adposition: 'no', coordinate: 'first' }),
			create_conjunction_token(),
			create_noun_token({ token: 'Mary', has_adposition: 'no', coordinate: 'last' }),
			create_verb_token('went'),
			create_period_token(),
		])

		expect_no_message(checked_tokens[2])
	})
	test('does not flag a noun that does not follow a coordinator: John saw Mary.', () => {
		const checked_tokens = check([
			create_noun_token({ token: 'John', has_adposition: 'no', coordinate: 'no_partner' }),
			create_verb_token('saw'),
			create_noun_token({ token: 'Mary', has_adposition: 'no', coordinate: 'no_partner' }),
			create_period_token(),
		])

		expect_no_message(checked_tokens[2])
	})
})

describe('Suggest repeating the adposition before a coordinated noun after an adposition phrase', () => {
	const COORDINATED_AFTER_ADPOSITION_RULE = CHECKER_RULES.filter(rule => rule.name === 'Suggest repeating the adposition before a coordinated noun after an adposition phrase')

	const create_noun_token = ({ token, has_adposition, coordinate }: { token: string, has_adposition: 'yes' | 'no', coordinate?: 'first' | 'coordinate' | 'last' | 'no_partner' }) =>
		create_lookup_token_for_test({ token, tag: { has_adposition, ...coordinate ? { coordinate } : {} }, lookup_results: [lookup_result_for_test({ stem: token, part_of_speech: 'Noun' })] })
	const create_adposition_token = (token: string) => create_token({ token, type: TOKEN_TYPE.FUNCTION_WORD, tag: { 'pre_np_adposition': 'relation' } })
	const create_conjunction_token = () => create_token({ token: 'and', type: TOKEN_TYPE.LOOKUP_WORD, tag: { 'syntax': 'coord_noun' } })
	const create_list_comma_token = () => create_token({ token: ',', type: TOKEN_TYPE.PUNCTUATION, tag: { 'syntax': 'comma', 'list_comma': 'np' } })
	const check = (tokens: Token[]) => apply_rules({ sentences: [create_sentence_for_test(tokens)], rules: COORDINATED_AFTER_ADPOSITION_RULE }).flatMap(flatten_sentence)

	test('warns about a noun coordinated with the noun the adposition phrase belongs to: The brother of John and Mary.', () => {
		const checked_tokens = check([
			create_noun_token({ token: 'brother', has_adposition: 'no', coordinate: 'first' }),
			create_adposition_token('of'),
			create_noun_token({ token: 'John', has_adposition: 'yes' }),
			create_conjunction_token(),
			create_noun_token({ token: 'Mary', has_adposition: 'no', coordinate: 'last' }),
		])

		expect_message_to_match({ token: checked_tokens[4], message_type: 'suggest', regex: /^If you intend 'Mary' to coordinate with 'John'/ })
	})
	test('warns only about the first noun after the adposition phrase in a list: The brother of John, Mary and Peter.', () => {
		const checked_tokens = check([
			create_noun_token({ token: 'brother', has_adposition: 'no', coordinate: 'first' }),
			create_adposition_token('of'),
			create_noun_token({ token: 'John', has_adposition: 'yes' }),
			create_list_comma_token(),
			create_noun_token({ token: 'Mary', has_adposition: 'no', coordinate: 'coordinate' }),
			create_conjunction_token(),
			create_noun_token({ token: 'Peter', has_adposition: 'no', coordinate: 'last' }),
		])

		expect_message_to_match({ token: checked_tokens[4], message_type: 'suggest', regex: /^If you intend 'Mary' to coordinate with 'John'/ })
		expect_no_message(checked_tokens[6])
	})
	test('does not warn when the adposition is repeated: The brother of John and of Mary.', () => {
		const checked_tokens = check([
			create_noun_token({ token: 'brother', has_adposition: 'no' }),
			create_adposition_token('of'),
			create_noun_token({ token: 'John', has_adposition: 'yes', coordinate: 'first' }),
			create_conjunction_token(),
			create_adposition_token('of'),
			create_noun_token({ token: 'Mary', has_adposition: 'yes', coordinate: 'last' }),
		])

		expect_no_message(checked_tokens[5])
	})
	test('does not warn about coordinated nouns without any adposition: John and Mary.', () => {
		const checked_tokens = check([
			create_noun_token({ token: 'John', has_adposition: 'no', coordinate: 'first' }),
			create_conjunction_token(),
			create_noun_token({ token: 'Mary', has_adposition: 'no', coordinate: 'last' }),
		])

		expect_no_message(checked_tokens[2])
	})
	test('does not warn about a noun that is not coordinated with anything: John went to Jerusalem and Bethlehem.', () => {
		const checked_tokens = check([
			create_adposition_token('to'),
			create_noun_token({ token: 'Jerusalem', has_adposition: 'yes' }),
			create_conjunction_token(),
			create_noun_token({ token: 'Bethlehem', has_adposition: 'no' }),
		])

		expect_no_message(checked_tokens[3])
	})
})
