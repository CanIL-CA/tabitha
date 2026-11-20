import { create_context_filter, create_token_filter } from '#lib/rules/rules_parser.js'
import { get_adjective_case_frame_rules } from './adjectives/case_frames'
import { get_verb_case_frame_rules, get_passive_verb_case_frame_rules } from './verbs/case_frames'
import { get_adposition_case_frame_rules } from './adpositions/case_frames'
import { get_conjunction_case_frame_rules } from './conjunctions/case_frames'
import { initialize_case_frame_rules, check_case_frames } from './common'
import type { Token } from '#lib/types.js'
import type { CaseFrameRuleInfo } from '#lib/rules/case_frame/types.js'
import type { RuleTriggerContext, TokenFilter } from '#lib/rules/types.js'

const CASE_FRAME_RULE_GETTERS = new Map<string, (token: Token) => CaseFrameRuleInfo>([
	['Verb', get_verb_case_frame_rules],
	['Adjective', get_adjective_case_frame_rules],
	['Adposition', get_adposition_case_frame_rules],
	['Conjunction', get_conjunction_case_frame_rules],
])

export const is_verb: TokenFilter = create_token_filter({ 'category': 'Verb' })

export const is_passive_verb_context = create_context_filter({
	'precededby': { 'tag': { 'auxiliary': 'passive' }, 'skip': 'all' },
	'followedby': { 'tag': { 'pre_np_adposition': 'agent_of_passive' }, 'skip': 'all' },
})

export function initialize_word_case_frames(trigger_context: RuleTriggerContext) {
	const part_of_speech = trigger_context.trigger_token.lookup_results[0].part_of_speech
	const case_frame_rule_getter = CASE_FRAME_RULE_GETTERS.get(part_of_speech)
	if (case_frame_rule_getter) {
		initialize_case_frame_rules({ trigger_context, rule_info_getter: case_frame_rule_getter })
	}
}

export function has_invalid_case_frame(token: Token): boolean {
	return token.lookup_results.some(({ case_frame }) => case_frame.result.status === 'invalid')
}

export function check_passive_verb_case_frames(trigger_context: RuleTriggerContext) {
	initialize_case_frame_rules({ trigger_context, rule_info_getter: get_passive_verb_case_frame_rules })
	check_case_frames(trigger_context)
}
