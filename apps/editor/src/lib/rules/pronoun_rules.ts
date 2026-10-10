import { create_context_filter, from_built_in_rule, message_set_action } from './rules_parser'
import { TOKEN_TYPE, add_tag_to_token } from '../token'
import type { BuiltInRule } from '#lib/rules/types.js'

const FIRST_PERSON = ['i', 'me', 'my', 'myself', 'we', 'us', 'our', 'ourselves']
const SECOND_PERSON = ['you', 'your', 'yourself', 'yourselves']
const THIRD_PERSON = ['he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'its', 'itself', 'they', 'them', 'their', 'theirs', 'themselves']

const PRONOUN_MESSAGES = new Map([
	['mine', '"mine" should be replaced with "my() X", e.g., That book is my(Paul\'s) book.'],
	['ours', '"ours" should be replaced with "our() X", e.g., That book is our(Paul\'s) book.'],
	['yours', '"yours" should be replaced with "your() X", e.g., That book is your(Paul\'s) book.'],
	['each-other', '"each-other" requires its respective Noun in parentheses, e.g., each-other(people).'],
])
FIRST_PERSON.forEach(p => PRONOUN_MESSAGES.set(p, 'First person pronouns require their respective Noun in parentheses, e.g., {token}(Paul).'))
SECOND_PERSON.forEach(p => PRONOUN_MESSAGES.set(p, 'Second person pronouns require their respective Noun in parentheses, e.g., {token}(Paul).'))
THIRD_PERSON.forEach(p => PRONOUN_MESSAGES.set(p, 'Third person pronouns should be replaced with the Noun they represent, e.g., Paul (instead of {token}).'))

export const PRONOUN_TAGS = new Map([
	['i', 'first_person|singular'],
	['me', 'first_person|singular'],
	['my', 'first_person|singular'],
	['myself', 'first_person|singular|reflexive'],
	['we', 'first_person|plural'],
	['us', 'first_person|plural'],
	['our', 'first_person|plural'],
	['ourselves', 'first_person|plural|reflexive'],
	['you', 'second_person'],
	['your', 'second_person'],
	['yourself', 'second_person|singular|reflexive'],
	['yourselves', 'second_person|plural|reflexive'],
	['each-other', 'reciprocal'],
])

/**
 * These rules are a subset of the syntax rules
 */
const builtin_pronoun_rules: BuiltInRule[] = [
	{
		'name': 'Check for invalid stand-alone pronouns',
		'comment': '',
		'rule': {
			trigger: ({ token }) => PRONOUN_MESSAGES.has(token.toLowerCase()),
			context: create_context_filter({}),
			action: message_set_action(({ trigger_token: { token } }) => ({ error: PRONOUN_MESSAGES.get(token.toLowerCase()) })),
		},
	},
	{
		'name': 'Tag valid pronoun referents and check for invalid ones',
		'comment': '',
		'rule': {
			trigger: token => token.type === TOKEN_TYPE.LOOKUP_WORD && token.pronoun !== null,
			context: create_context_filter({}),
			action: message_set_action(({ trigger_token, rule_id }) => {
				const pronoun = trigger_token.pronoun!
				const normalized_pronoun = pronoun.token.toLowerCase()

				const tag = PRONOUN_TAGS.get(normalized_pronoun)
				const message = PRONOUN_MESSAGES.get(normalized_pronoun) ?? 'Unrecognized pronoun "{token}"'
				if (tag) {
					add_tag_to_token({ token: trigger_token, tag: { 'pronoun': tag }, rule_id })
				} else {
					return { token_to_flag: pronoun, error: message }
				}
			}),
		},
	},
]

export const PRONOUN_RULES = builtin_pronoun_rules.map(from_built_in_rule('pronoun'))
