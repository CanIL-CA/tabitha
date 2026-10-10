import { TOKEN_TYPE, flatten_sentence } from '../token'
import { apply_rules } from './rules_processor'
import { SYNTAX_RULES } from './syntax_rules'
import { tokenize_input } from '#lib/parser/tokenize.js'
import { clausify } from '#lib/parser/clausify.js'
import { describe, expect, test } from 'vitest'

describe('sentence syntax: tag setting', () => {
	test('quote_begin clause tag', () => {
		const test_tokens = clausify(tokenize_input('People [] say [] person ["].'))

		const checked_tokens = apply_rules({ sentences: test_tokens, rules: SYNTAX_RULES })
		const clause_tokens = checked_tokens[0].clause.sub_tokens
		
		expect(clause_tokens[1].type).toBe(TOKEN_TYPE.CLAUSE)
		expect(clause_tokens[1].tag).toHaveProperty('clause_type', 'subordinate_clause')
		expect(clause_tokens[3].type).toBe(TOKEN_TYPE.CLAUSE)
		expect(clause_tokens[3].tag).toHaveProperty('clause_type', 'subordinate_clause')
		expect(clause_tokens[5].type).toBe(TOKEN_TYPE.CLAUSE)
		expect(clause_tokens[5].tag).toHaveProperty('clause_type', 'patient_clause_quote_begin')
	})
})

describe('sentence syntax: first_word detection', () => {
	test('. empty sentence', () => {
		const test_tokens = clausify(tokenize_input('.'))
		const result_tokens = apply_rules({ sentences: test_tokens, rules: SYNTAX_RULES })

		expect(result_tokens).toEqual(test_tokens)
	})
	test('Token token.', () => {
		const test_tokens = clausify(tokenize_input('Token token.'))
		const result_tokens = apply_rules({ sentences: test_tokens, rules: SYNTAX_RULES }).flatMap(flatten_sentence)

		expect(result_tokens[0].tag).toHaveProperty('position', 'first_word')
		expect(result_tokens[1].tag).not.toHaveProperty('position', 'first_word')
	})
	test('Token. Token.', () => {
		const test_tokens = clausify(tokenize_input('Token. Token.'))
		const result_tokens = apply_rules({ sentences: test_tokens, rules: SYNTAX_RULES }).flatMap(flatten_sentence)

		expect(result_tokens[0].tag).toHaveProperty('position', 'first_word')
		expect(result_tokens[1].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[2].tag).toHaveProperty('position', 'first_word')
		expect(result_tokens[3].tag).not.toHaveProperty('position', 'first_word')
	})
	test('.5 token. 100 token. numbers count as a word', () => {
		const test_tokens = clausify(tokenize_input('.5 token. 100 token.'))
		const result_tokens = apply_rules({ sentences: test_tokens, rules: SYNTAX_RULES }).flatMap(flatten_sentence)

		expect(result_tokens[0].tag).toHaveProperty('position', 'first_word')
		expect(result_tokens[1].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[2].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[3].tag).toHaveProperty('position', 'first_word')
		expect(result_tokens[4].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[5].tag).not.toHaveProperty('position', 'first_word')
	})
	test('_note Token. (imp) Token. notes get skipped over', () => {
		const test_tokens = clausify(tokenize_input('_note Token. (imp) Token.'))
		const result_tokens = apply_rules({ sentences: test_tokens, rules: SYNTAX_RULES }).flatMap(flatten_sentence)

		expect(result_tokens[0].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[1].tag).toHaveProperty('position', 'first_word')
		expect(result_tokens[2].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[3].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[4].tag).toHaveProperty('position', 'first_word')
		expect(result_tokens[5].tag).not.toHaveProperty('position', 'first_word')
	})
	test('[Token] token. first word in nested clause', () => {
		const test_tokens = clausify(tokenize_input('[Token] token.'))
		const result_tokens = apply_rules({ sentences: test_tokens, rules: SYNTAX_RULES }).flatMap(flatten_sentence)

		expect(result_tokens[0].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[1].tag).toHaveProperty('position', 'first_word')
		expect(result_tokens[2].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[3].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[4].tag).not.toHaveProperty('position', 'first_word')
	})
	test('[[Token]] token. first word in double nested clause', () => {
		const test_tokens = clausify(tokenize_input('[[Token]] token.'))
		const result_tokens = apply_rules({ sentences: test_tokens, rules: SYNTAX_RULES }).flatMap(flatten_sentence)

		expect(result_tokens[0].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[1].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[2].tag).toHaveProperty('position', 'first_word')
		expect(result_tokens[3].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[4].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[5].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[6].tag).not.toHaveProperty('position', 'first_word')
	})
	test('A token. function words get tagged', () => {
		const test_tokens = clausify(tokenize_input('A token.'))
		const result_tokens = apply_rules({ sentences: test_tokens, rules: SYNTAX_RULES }).flatMap(flatten_sentence)

		expect(result_tokens[0].tag).toHaveProperty('position', 'first_word')
		expect(result_tokens[1].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[2].tag).not.toHaveProperty('position', 'first_word')
	})
	test('Followers/disciples token. pairings get tagged', () => {
		const test_tokens = clausify(tokenize_input('Followers/disciples token.'))
		const result_tokens = apply_rules({ sentences: test_tokens, rules: SYNTAX_RULES }).flatMap(flatten_sentence)

		expect(result_tokens[0].tag).toHaveProperty('position', 'first_word')
		expect(result_tokens[0].pairing?.tag).toHaveProperty('position', 'first_word')
		expect(result_tokens[1].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[2].tag).not.toHaveProperty('position', 'first_word')
	})
	test('You(token) token. pronoun referents get tagged', () => {
		const test_tokens = clausify(tokenize_input('You(token) token.'))
		const result_tokens = apply_rules({ sentences: test_tokens, rules: SYNTAX_RULES }).flatMap(flatten_sentence)

		expect(result_tokens[0].tag).toHaveProperty('position', 'first_word')
		expect(result_tokens[0].pronoun?.tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[1].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[2].tag).not.toHaveProperty('position', 'first_word')
	})
	test('Token [token] ["Token"]. words in quote clauses get tagged, but not other subordinate clauses', () => {
		const test_tokens = clausify(tokenize_input('Token [token] ["Token"].'))
		const result_tokens = apply_rules({ sentences: test_tokens, rules: SYNTAX_RULES }).flatMap(flatten_sentence)

		expect(result_tokens[0].tag).toHaveProperty('position', 'first_word')
		expect(result_tokens[1].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[2].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[3].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[4].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[5].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[6].tag).toHaveProperty('position', 'first_word')
		expect(result_tokens[7].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[8].tag).not.toHaveProperty('position', 'first_word')
		expect(result_tokens[9].tag).not.toHaveProperty('position', 'first_word')
	})

	test('verse reference syntax rule tags single and ranged verse numbers', () => {
		const test_tokens = clausify(tokenize_input('Verse 5:10 text.'))
		const result_tokens = apply_rules({ sentences: test_tokens, rules: SYNTAX_RULES }).flatMap(flatten_sentence)

		const colon_token = result_tokens.find(t => t.token === ':')
		expect(colon_token?.tag).toHaveProperty('syntax', 'verse_ref_colon')

		const range_tokens = clausify(tokenize_input('Verse 5:10-12 text.'))
		const range_result = apply_rules({ sentences: range_tokens, rules: SYNTAX_RULES }).flatMap(flatten_sentence)

		const hyphen_token = range_result.find(t => t.token === '-')
		expect(hyphen_token?.tag).toHaveProperty('syntax', 'verse_ref_hyphen')
	})
})