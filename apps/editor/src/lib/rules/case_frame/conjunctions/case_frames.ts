import { parse_case_frame_rule } from '#lib/rules/case_frame/common.js'
import type { LookupResult } from '#lib/types.js'
import type { ConjunctionRoleTag, ArgumentRoleRule, CaseFrameRuleInfo, RoleRuleJson, RoleUsageInfo } from '#lib/rules/case_frame/types.js'

const default_conjunction_usage_json: RoleRuleJson<ConjunctionRoleTag> = {
	'opening_clause': [
		{
			'trigger': { 'tag': { 'syntax': 'coord_clause' } },
			'check_self': true,
		},
		{
			'trigger': { 'tag': { 'position': 'first_word' } },
			'check_self': true,
		},
	],
	'in_noun_phrase': {
		'trigger': { 'tag': { 'syntax': 'coord_noun' } },
		'check_self': true,
	},
	'in_adjective_phrase': {
		'trigger': { 'tag': { 'syntax': 'coord_adj' } },
		'check_self': true,
	},
	'in_adverb_phrase': {
		'trigger': { 'tag': { 'syntax': 'coord_adv' } },
		'check_self': true,
	},
}

function create_usage_rules(): ArgumentRoleRule[] {
	return Object.entries(default_conjunction_usage_json)
		.flatMap(([role_tag, rule_json]) => parse_case_frame_rule({ sense: 'conj_default', role_tag, rule_json }))
}

const DEFAULT_USAGE_RULES = create_usage_rules()

export function get_conjunction_case_frame_rules(): CaseFrameRuleInfo {
	return {
		rules_by_sense: [],
		default_rule_getter: get_default_usage_rules,
		role_info_getter: get_conjunction_usage_info,
		should_check: true,
	}
}

function get_default_usage_rules(lookup: LookupResult) {
	const roles = convert_usage_info(lookup.categorization)

	return DEFAULT_USAGE_RULES.filter(rule => roles.includes(rule.role_tag))
}

const CONJUNCTION_LETTER_TO_ROLE = new Map<string, ConjunctionRoleTag>([
	['A', 'opening_clause'],
	['B', 'in_noun_phrase'],
	['C', 'in_adjective_phrase'],
	['D', 'in_adverb_phrase'],
])

function get_conjunction_usage_info(categorization: string): RoleUsageInfo {
	// no conjunction has any 'other' rules
	const usage_roles = convert_usage_info(categorization)
	return {
		possible_roles: usage_roles,
		required_roles: usage_roles,
	}
}

function convert_usage_info(categorization: string): string[] {
	const usage_roles = [...categorization].filter(c => c !== '_')
		.map(c => CONJUNCTION_LETTER_TO_ROLE.get(c))
		.filter(c => !!c)
	// The only conjunctions with blank usage are ones that are used in clauses
	return usage_roles.length > 0 ? usage_roles : ['opening_clause']
}
