import { TOKEN_TYPE, add_tag_to_token, create_token } from '#lib/token.js'
import { REGEXES } from '#lib/regexes.js'
import { PRONOUN_RULES } from './pronoun_rules'
import { create_context_filter, create_token_filter, simple_rule_action, from_built_in_rule } from './rules_parser'
import type { CheckerTokenType } from '@tabitha/types'
import type { Token } from '#lib/types.js'
import type { BuiltInRule } from '#lib/rules/types.js'

/**
 * These rules are for tagging tokens based on the syntax. These cannot rely on any lookup data.
 */
const builtin_syntax_rules: BuiltInRule[] = [
	{
		name: 'Set tag for quote clauses',
		comment: '',
		rule: {
			trigger: create_token_filter({ 'tag': { 'clause_type': 'subordinate_clause' } }),
			context: create_context_filter({ 'subtokens': { 'token': '"', 'skip': { 'token': '[' } } }),
			action: simple_rule_action(({ trigger_token, subtoken_indexes, rule_id }) => {
				add_tag_to_token({ token: trigger_token, tag: { 'clause_type': 'patient_clause_quote_begin' }, rule_id })
				add_tag_to_token({ token: trigger_token.sub_tokens[subtoken_indexes[0]], tag: { 'quote': 'begin' }, rule_id })
			}),
		},
	},
	{
		name: 'Set tag for first words of sentences',
		comment: '',
		rule: {
			trigger: create_token_filter({ 'tag': { 'clause_type': 'main_clause|patient_clause_quote_begin' } }),
			context: create_context_filter({}),
			action: simple_rule_action(({ trigger_token, rule_id }) => {
				// find first word token, even if nested in another clause
				const word_token = find_first_word(trigger_token)
				if (!word_token) {
					return
				}

				add_tag_to_token({ token: word_token, tag: { 'position': 'first_word' }, rule_id })
				if (word_token.pairing) {
					add_tag_to_token({ token: word_token.pairing, tag: { 'position': 'first_word' }, rule_id })
				}
			}),
		},
	},
	{
		name: "Set tag for words with possessive 's as genitive_saxon",
		comment: '',
		rule: {
			trigger: token => token.type === TOKEN_TYPE.LOOKUP_WORD && REGEXES.HAS_POSSESSIVE.test(token.token),
			context: create_context_filter({}),
			action: simple_rule_action(({ trigger_token, rule_id }) => {
				add_tag_to_token({ token: trigger_token, tag: { 'relation': 'genitive_saxon' }, rule_id })
			}),
		},
	},
	{
		name: 'Tag numbers at the start of a verse references',
		comment: '',
		rule: {
			trigger: token => /^\d/.test(token.token),
			context: create_context_filter({
				'followedby': { 'tag': { 'syntax': 'verse_ref_colon' } },
			}),
			action: simple_rule_action(({ trigger_token, rule_id }) => {
				add_tag_to_token({ token: trigger_token, tag: { 'role': 'verse_ref' }, rule_id })
			}),
		},
	},
	{
		name: 'Tag and/or split numbers at the end of a verse references',
		comment: '',
		rule: {
			trigger: token => /^\d/.test(token.token),
			context: create_context_filter({
				'precededby': { 'tag': { 'syntax': 'verse_ref_colon' } },
			}),
			action: ({ tokens, trigger_index, trigger_token, rule_id }) => {
				if (trigger_token.token.includes('-')) {
					// this is a verse range (eg. Jeremiah 31:31-34)
					const verse_numbers = trigger_token.token.split('-')
					const applied_rules = [`create - ${rule_id}`]

					tokens.splice(trigger_index, 1,
						create_token({
							token: verse_numbers[0],
							type: TOKEN_TYPE.LOOKUP_WORD,
							lookup_terms: [verse_numbers[0]],
							tag: { 'role': 'verse_ref' },
							applied_rules,
						}),
						create_token({
							token: '-',
							type: TOKEN_TYPE.FUNCTION_WORD,
							tag: { 'syntax': 'verse_ref_hyphen' },
							applied_rules,
						}),
						create_token({
							token: verse_numbers[1],
							type: TOKEN_TYPE.LOOKUP_WORD,
							lookup_terms: [verse_numbers[1]],
							tag: { 'role': 'verse_ref' },
							applied_rules,
						}),
					)
					return trigger_index + 3	// add 2 and advance 1
				}

				add_tag_to_token({ token: trigger_token, tag: { 'role': 'verse_ref' }, rule_id })

				return trigger_index + 1
			},
		},
	},
]

export const SYNTAX_RULES = builtin_syntax_rules.map(from_built_in_rule('syntax')).concat(PRONOUN_RULES)

export function find_first_word(token: Token): Token | undefined {
	if (token_is_word(token)) {
		return token
	}
	for (const sub_token of token.sub_tokens) {
		const result = find_first_word(sub_token)
		if (result) {
			return result
		}
	}
	return undefined

	function token_is_word(token: Token): boolean {
		const word_types: CheckerTokenType[] = [TOKEN_TYPE.LOOKUP_WORD, TOKEN_TYPE.FUNCTION_WORD]

		return word_types.includes(token.type)
			|| token.token.length > 0 && REGEXES.WORD_START_CHAR.test(token.token[0])
	}
}