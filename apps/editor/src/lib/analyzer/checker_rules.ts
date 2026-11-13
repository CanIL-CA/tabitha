import { LOOKUP_FILTERS } from '#lib/lookup_filters.js'
import { TOKEN_TYPE, is_one_part_of_speech } from '#lib/token.js'
import { create_context_filter, create_token_filter, from_built_in_rule, message_set_action } from '#lib/rules/rules_parser.js'
import { validate_case_frame_for_analyze } from '#lib/rules/case_frame/common.ts'
import { parse_checker_rule } from '#lib/rules/checker_rules.ts'
import type { MessageInfo, Token } from '#lib/types.js'
import type { BuiltInRule, CheckerRuleJson, LookupFilter, TokenFilter } from '#lib/rules/types.js'

// These are analyzer-specific checker rules. An error is blocking and warnings are not.
// Some are copied over from the main checker, sometimes given a different severity and message.
// Warnings and suggestions become notices of something to pay attention to.
const checker_rules_json: CheckerRuleJson[] = [
	{
		'name': 'Expect an agent of a passive',
		'trigger': { 'category': 'Verb', 'form': 'perfect' },
		'context': {
			'precededby': { 'tag': { 'auxiliary': 'passive' }, 'skip': 'all' },
			'notfollowedby': { 'tag': [{ 'role': 'agent' }, { 'pre_np_adposition': 'agent_of_passive' }], 'skip': 'all' },
		},
		'warning': {
			'followedby': 'by X',
			'message': 'A passive verb must have an explicit agent. Use _implicitActiveAgent if necessary.',
		},
		'comment': 'A passive verb requires a "by X" agent.',
	},
	{
		'name': 'each other must be hyphenated',
		'trigger': { 'stem': 'each' },
		'context': {
			'followedby': { 'stem': 'other' },
			'notfollowedby': { 'category': 'Noun', 'skip': { 'category': 'Adjective' } },
		},
		'warning': {
			'message': 'each-other was not interpreted as Reciprocal because it was not hyphenated.',
		},
	},
	{
		'name': "Suggest expanding 'there' to 'at that place' for clarity",
		'trigger': { 'token': 'There|there' },
		'context': { 'notfollowedby': { 'stem': 'be', 'skip': 'vp_modifiers' } },	// TODO trigger on 'not tag existential' instead
		'suggest': {
			'message': "Check that 'at that place' was intended by the use of 'there'.",
		},
	},
	{
		'name': "Suggest expanding 'here' to 'at this place' for clarity",
		'trigger': { 'token': 'Here|here' },
		'suggest': {
			'message': "Check that 'at this place' was intended by the use of 'here'.",
		},
	},
	{
		'name': 'Flag two verbs within the same sentence',
		'trigger': { 'category': 'Verb' },
		'context': {
			'precededby': { 'category': 'Verb', 'skip': 'all' },
		},
		'warning': {
			'message': 'Multiple verbs were found in this clause. There might be an unbracketed subordinate clause, or they might need to be coordinated.',
		},
		'comment': 'See section 0.3 of the Phase 1 checklist',
	},
	{
		'name': 'Repeat the adposition before a coordinated noun',
		'trigger': { 'category': 'Noun', 'tag': { 'coordinate': 'no_partner|first' } },
		'context': {
			'precededby': { 'tag': [{ 'syntax': 'coord_noun' }, 'list_comma'], 'skip': 'np_modifiers_and_adpositions' },
		},
		'warning': {
			'message': "'{token}' was likely not coordinated properly because it's adposition doesn't match that of a preceding noun.",
		},
		'comment': "A noun after a coordinator with no preceding coordinate partner is not coordinated with anything, eg 'John went to Jerusalem and Bethlehem', or 'to the house of James and in the store'.",
	},
	{
		'name': "Don't allow 'where' as a relativizer",
		'trigger': { 'token': 'where' },
		'context': {
			'precededby': { 'token': '[' },
			'notfollowedby': { 'token': '?', 'skip': 'all' },
		},
		'warning': {
			'message': "Check if 'where' was misinterpreted.",
		},
		'comment': 'See section 0.8 of the Phase 1 checklist',
	},
	{
		'name': "Don't allow 'when' as a relativizer",
		'trigger': { 'type': TOKEN_TYPE.CLAUSE },
		'context': {
			'precededby': { 'token': 'time' },
			'subtokens': { 'token': 'when', 'skip': 'clause_start' },
		},
		'warning': {
			'on': 'subtokens:0',
			'message': "Check if 'when' was misinterpreted.",
		},
		'comment': 'See section 0.8 of the Phase 1 checklist.',
	},
	{
		'name': "Check for an errant 'that' in a complement clause",
		'trigger': { 'tag': { 'clause_type': 'patient_clause_different_participant|agent_clause' } },
		'context': {
			'subtokens': { 'token': 'that', 'skip': 'clause_start' },
		},
		'suggest': {
			'on': 'subtokens:0',
			'message': "This 'that' was interpreted as a demonstrative. Make sure that was intended.",
		},
		'comment': 'While TBTA sometimes accepts it, using "that" as a complementizer is too inconsistent and so is not allowed in P1',
	},
	{
		'name': 'Check for nested independent clauses with "and" or "but", when not preceded by a clause',
		'trigger': { 'type': TOKEN_TYPE.CLAUSE },
		'context': {
			'subtokens': [{ 'token': '[' }, { 'token': 'and|but' }],
			'notprecededby': { 'type': TOKEN_TYPE.CLAUSE },
		},
		'suggest': {
			'on': 'subtokens:0',
			'message': 'This may be an unintentional nested independent clause. Check if you need to split the sentence in two.',
		},
	},
	{
		'name': 'Check for nested independent clauses with "and" or "but", when preceded by a relative clause',
		'trigger': { 'type': TOKEN_TYPE.CLAUSE, 'tag': { 'clause_type': 'patient_clause_different_participant' } },
		'context': {
			'subtokens': [{ 'token': '[' }, { 'token': 'and|but' }],
			'precededby': { 'type': TOKEN_TYPE.CLAUSE, 'tag': { 'clause_type': 'relative_clause' } },
		},
		'suggest': {
			'on': 'subtokens:0',
			'message': 'This may be an unintentional nested independent clause. Check if you need to split the sentence in two.',
		},
	},
	{
		'name': 'Warn when there is no clause with (simple) after a clause with (complex)',
		'comment': 'a simple alternate should (usually) follow a complex alternate',
		'trigger': { 'type': TOKEN_TYPE.CLAUSE, 'tag': { 'vocabulary_alternate': 'complex' } },
		'context': {
			'subtokens': { 'token': '(complex)', 'skip': 'all' },
			'notfollowedby': { 'tag': 'vocabulary_alternate' },
		},
		'warning': {
			'on': 'subtokens:0',
			'message': 'A simple vocabulary alternate typically directly follows a complex alternate, but no simple alternate was found.',
		},
	},
]

const builtin_checker_rules: BuiltInRule[] = [
	{
		name: 'Check Verb argument structure/case frame',
		comment: "Don't validate Verbs that are in the same clause as another Verb, since there is already an error that will show for that",
		rule: {
			trigger: create_token_filter({ 'category': 'Verb' }),
			context: create_context_filter({
				'notprecededby': { 'category': 'Verb', 'skip': 'all' },
			}),
			action: message_set_action(validate_case_frame_for_analyze),
		},
	},
	{
		name: 'Check argument structure/case frame',
		comment: 'case frame rules can eventually be used for verbs, adjectives, adverbs, adpositions, and even conjunctions',
		rule: {
			trigger: create_token_filter({ 'category': 'Adjective|Adposition' }),
			context: create_context_filter({ }),
			action: message_set_action(validate_case_frame_for_analyze),
		},
	},
	{
		name: 'Check that level 2/3 words are within a (complex) alternate',
		comment: 'The complex word may be in a nested clause within the clause that has the (complex) tag',
		rule: {
			trigger: create_token_filter({ 'tag': { 'clause_type': 'main_clause' } }),
			context: create_context_filter({ }),
			action: message_set_action(({ trigger_token }) => {
				const complex_alternate_filter = create_token_filter({ 'token': '(complex)' })
				const complex_word_filter = check_token_level(LOOKUP_FILTERS.IS_LEVEL_COMPLEX)

				// the stack makes it easy to track state as we go up and down clause nesting levels
				let is_complex_alternate_stack = [false]

				const messages: MessageInfo[] = []

				function search_clause_tokens(clause_tokens: Token[]) {
					for (let i = 0; i < clause_tokens.length; i++) {
						const token = clause_tokens[i]
						if (complex_alternate_filter(token)) {
							is_complex_alternate_stack = is_complex_alternate_stack.with(-1, true)

						} else if (token.sub_tokens.length) {
							is_complex_alternate_stack.push(is_complex_alternate_stack.at(-1) ?? false)
							search_clause_tokens(token.sub_tokens)
							is_complex_alternate_stack.pop()

						} else if (!is_complex_alternate_stack.at(-1)) {
							// simply check the first lookup result, as that's what will be selected.
							if (complex_word_filter(token)) {
								messages.push({ token_to_flag: token, warning: 'Word must be a level 0 or 1.' })
							}
							// A literal pairing has the same restrictions as a normal word
							if (token.pairing && token.pairing_type === 'dynamic-literal' && complex_word_filter(token.pairing)) {
								messages.push({ token_to_flag: token.pairing, warning: 'Word must be a level 0 or 1.' })
							}
						}
					}
				}

				search_clause_tokens(trigger_token.sub_tokens)

				return messages
			}),
		},
	},
	{
		name: 'Check word complexity level of complex pairings',
		comment: '',
		rule: {
			trigger: token => token.pairing_type === 'simple-complex',
			context: create_context_filter({}),
			action: message_set_action(function* ({ trigger_token: token }) {
				// a complex pairing word should always be level 2 or 3
				if (token.pairing && !check_token_level(LOOKUP_FILTERS.IS_LEVEL_COMPLEX)(token.pairing)) {
					yield { token_to_flag: token.pairing, error: 'Word must be a level 2 or 3.' }
				}
			}),
		},
	},
	{
		name: 'Check ontology status',
		comment: '',
		rule: {
			trigger: token => token.type === TOKEN_TYPE.LOOKUP_WORD,
			context: create_context_filter({}),
			action: message_set_action(function* ({ trigger_token: token }) {
				yield* check_ontology_status(token)

				if (token.pairing) {
					yield* check_ontology_status(token.pairing)
				}
			}),
		},
	},
	{
		name: 'Check for words with ambiguous parts of speech',
		comment: '',
		rule: {
			trigger: token => token.type === TOKEN_TYPE.LOOKUP_WORD && token.lookup_results.length > 0 && !is_one_part_of_speech(token),
			context: create_context_filter({}),
			action: message_set_action(function* () {
				yield { error: "The Analyzer cannot determine which part of speech '{stem}' is. Add '_noun', '_verb', '_adj', '_adv', '_adp', '_conj', or '_part' so it analyzes properly." }
			}),
		},
	},
	{
		name: 'Check for a relative clause that might supposed to be a complement clause',
		comment: 'While TBTA sometimes accepts it, using "that" as a complementizer is too inconsistent and so is not allowed in P1',
		rule: {
			trigger: create_token_filter({ 'tag': { 'clause_type': 'relative_clause_that' } }),
			context: create_context_filter({
				'precededby': { 'category': 'Verb', 'skip': 'all' },
			}),
			action: message_set_action(({ tokens, context_indexes }) => {
				const verb_token = tokens[context_indexes[0]]
				const case_frames = verb_token.lookup_results.map(result => result.case_frame.result)
				if (case_frames.length === 0 || case_frames[0].status !== 'invalid') {
					return
				}
				const missing_arguments = new Set(case_frames.flatMap(case_frame => case_frame.missing_arguments))

				// Only show the message if all senses are invalid, but some are missing a patient clause
				if (['agent_clause', 'patient_clause_different_participant'].some(role => missing_arguments.has(role))) {
					return { warning: 'This was interpreted as a relative clause, but may have been intended as a complement clause.' }
				}
			}),
		},
	},
	{
		name: 'Expect an agent of a passive (handles stem verbs)',
		comment: 'eg. "John was go-up the mountain by(close to) the river" is not a passive, but this situation is incredibly rare.',
		rule: {
			trigger: create_token_filter({ 'category': 'Verb', 'form': 'stem' }),
			context: create_context_filter({
				'precededby': { 'tag': { 'auxiliary': 'passive' }, 'skip': 'all' },
				'notfollowedby': { 'token': 'by|by X', 'skip': 'all' },
			}),
			action: message_set_action(({ trigger_token }) => {
				const top_result = trigger_token.lookup_results[0]
				if (top_result.form.includes('perfect')) {
					// don't show a warning for a word like 'cut', since we already know it's a passive, and is handled in another rule
					return
				}

				if (top_result.case_frame.usage.possible_roles.includes('patient')) {
					// A verb like 'was sit-down' looks at first like it could be passive, but can never take a patient
					return { warning: 'It was unclear if this verb is supposed to be a passive, so it may have been misinterpreted.' }
				}
			}),
		},
	},
]

export const ANALYZER_CHECKER_RULES = builtin_checker_rules.map(from_built_in_rule('analyzer-check')).concat(checker_rules_json.map((rule_json, index) => parse_checker_rule({ rule_json, index })))

function check_token_level(level_check: LookupFilter): TokenFilter {
	return token => {
		return token.lookup_results.length > 0 && level_check(token.lookup_results[0])
	}
}

function* check_ontology_status(token: Token): Generator<MessageInfo, void, unknown> {
	const top_result = token.lookup_results.at(0)

	if (!top_result || top_result.ontology_status === 'not used' || top_result.ontology_status === 'unknown') {
		yield { token_to_flag: token, error: "'{token}' is not recognized and could not be analyzed." }

	} else if (top_result?.gloss.includes('DELETE')) {
		yield { token_to_flag: token, warning: 'The {category} {sense} is set to be removed from the Ontology and should not be used.' }
	}
}
