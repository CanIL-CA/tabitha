import { parse_case_frame_rule, parse_sense_rules } from '../common'
import { by_relative_context, head_noun, head_noun_post, opening_subordinate_clause } from './presets'
import type { Token, LookupResult } from '#lib/types.js'
import type {
	AdpositionRoleTag,
	ArgumentRoleRule,
	ArgumentRulesForSense,
	CaseFrameRuleInfo,
	RoleRuleJson,
	RoleUsageInfo,
	SenseRuleJson,
	WordSense,
	WordStem,
} from '#lib/rules/case_frame/types.js'

const default_adposition_usage_json: RoleRuleJson<AdpositionRoleTag> = {
	'opening_subordinate_clause': opening_subordinate_clause(),
	'in_noun_phrase': head_noun(),
}

/**
 * These rules allow each adposition sense to specify rules for each argument that is different from the default.
 * Only senses that differ from the default structure need to be included here.
 */
const adposition_case_frames = new Map<WordStem, [WordSense, SenseRuleJson<AdpositionRoleTag>][]>([
	['ago', [
		['ago-A', {
			'in_noun_phrase': head_noun_post(),
		}],
	]],
	['because', [
		['because-B', {
			'opening_subordinate_clause': { },
			'other_rules': {
				'of': {
					...by_relative_context({
						'followedby': { 'token': 'of' },
					}),
					'transform': { 'tag': { 'pre_np_adposition': 'oblique' }, 'remove_tag': 'relation' },
					'tag_role': false,
				},
			},
			'other_optional': 'of',
		}],
	]],
	['if', [
		['if-B', {
			'in_noun_phrase': { },
			'other_rules': {
				'were': {
					'trigger': { 'token': 'were' },
					'context': {
						'followedby': [{ 'token': 'to' }, { 'category': 'Verb' }],
					},
					'transform': { 'tag': { 'auxiliary': 'if-B' } },
					'tag_role': false,
				},
			},
			'other_optional': 'were',
			'comment': 'eg. If John were to leave...',
		}],
		['if-C', {
			'in_noun_phrase': { },
			'other_rules': {
				'had': {
					'trigger': { 'token': 'had' },
					'context': {
						'followedby': { 'category': 'Verb' },
					},
					'transform': { 'tag': { 'auxiliary': 'if-C' } },
					'tag_role': false,
				},
			},
			'other_optional': 'had',
			'comment': 'eg. If John had left...',
		}],
	]],
	['so', [
		['so-A', {
			'in_noun_phrase': { },
			'other_rules': {
				'could': {
					...by_relative_context({
						'followedby': { 'tag': { 'modal': 'conditional_could' }, 'skip': 'all' },
					}),
					'tag_role': false,
				},
			},
			'other_optional': 'could',
		}],
		['so-C', {
			'in_noun_phrase': { },
			'other_rules': {
				'would': {
					...by_relative_context({
						'followedby': { 'tag': { 'modal': 'conditional_would' }, 'skip': 'all' },
					}),
					'tag_role': false,
				},
			},
			'other_required': 'would',
		}],
	]],
])

function create_usage_rules(): ArgumentRoleRule[] {
	return Object.entries(default_adposition_usage_json)
		.flatMap(([role_tag, rule_json]) => parse_case_frame_rule({ sense: 'adp_default', role_tag, rule_json }))
}

function create_adposition_argument_rules(): Map<WordStem, ArgumentRulesForSense[]> {
	return new Map([...adposition_case_frames.entries()].map(([stem, sense_rules_json]) =>
		[stem, parse_sense_rules({ rule_json: sense_rules_json, defaults: DEFAULT_USAGE_RULES })]))
}

const DEFAULT_USAGE_RULES = create_usage_rules()
const ADPOSITION_USAGE_RULES = create_adposition_argument_rules()

export function get_adposition_case_frame_rules(token: Token): CaseFrameRuleInfo {
	const stem = token.lookup_results[0].stem
	return {
		rules_by_sense: ADPOSITION_USAGE_RULES.get(stem) ?? [],
		default_rule_getter: get_default_usage_rules,
		role_info_getter: (categorization, role_rules) => get_adposition_usage_info({ categorization, role_rules }),
		should_check: true,
	}
}

function get_default_usage_rules(lookup: LookupResult) {
	const roles = convert_usage_info(lookup.categorization)

	// No adposition has more than one usage value
	const matching_rule = DEFAULT_USAGE_RULES.find(rule => roles.includes(rule.role_tag))
	return matching_rule ? [matching_rule] : []
}

const ADPOSITION_LETTER_TO_ROLE = new Map([
	['A', 'in_noun_phrase'],
	['B', 'in_noun_phrase'],
	['C', 'opening_subordinate_clause'],
])

function get_adposition_usage_info({ categorization, role_rules }: { categorization: string; role_rules: ArgumentRulesForSense }): RoleUsageInfo {
	const usage_roles = convert_usage_info(categorization)

	const all_roles = usage_roles.concat(role_rules.other_optional).concat(role_rules.other_required)

	// some categorizations are blank or erroneously all underscores (eg early-A)
	// treat all arguments as possible and not required
	if (all_roles.length === 0) {
		return {
			possible_roles: [...ADPOSITION_LETTER_TO_ROLE.values()],
			required_roles: [],
		}
	}

	return {
		possible_roles: all_roles,
		required_roles: usage_roles.concat(role_rules.other_required),
	}
}

function convert_usage_info(categorization: string): string[] {
	const role_letters = [...categorization].filter(c => c !== '_')

	return role_letters
		.map(c => ADPOSITION_LETTER_TO_ROLE.get(c))
		.filter((role): role is string => Boolean(role))
}
