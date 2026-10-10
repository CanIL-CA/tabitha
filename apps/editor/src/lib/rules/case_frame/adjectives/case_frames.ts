import { parse_case_frame_rule, parse_sense_rules } from '../common'
import { by_adposition, by_clause_tag, by_complementizer, by_same_participant_complementizer, modified_noun_of_adjective, modified_noun_with_subgroup, unit_with_measure } from './presets'
import type { Token, LookupResult } from '#lib/types.js'
import type {
	AdjectiveRoleTag,
	ArgumentRoleRule,
	ArgumentRulesForSense,
	CaseFrameRuleInfo,
	RoleRuleJson,
	RoleRuleValueJson,
	RoleTag,
	RoleUsageInfo,
	SenseRuleJson,
	WordSense,
	WordStem,
} from '#lib/rules/case_frame/types.js'

const default_adjective_case_frame_json: RoleRuleJson<AdjectiveRoleTag> = {
	'modified_noun': modified_noun_of_adjective(),
	'nominal_argument': { 'trigger': 'none' },
	'patient_clause_different_participant': by_clause_tag('patient_clause_different_participant'),
	'patient_clause_same_participant': by_clause_tag('patient_clause_same_participant'),
	'modified_noun_with_subgroup': { 'trigger': 'none' },
}

/**
 * These rules allow each adjective sense to specify rules for each argument that is different from the default.
 * Only senses that differ from the default structure need to be included here.
 */
const adjective_case_frames = new Map<WordStem, [WordSense, SenseRuleJson<AdjectiveRoleTag>][]>([
	['afraid', [
		['afraid-B', { 'nominal_argument': by_adposition('of') }],
	]],
	['amazed', [
		['amazed-B', { 'nominal_argument': by_adposition('of|by') }],
	]],
	['angry', [
		['angry-B', { 'nominal_argument': by_adposition('at|with') }],
	]],
	['ashamed', [
		['ashamed-B', { 'nominal_argument': by_adposition('of|by') }],
	]],
	['attracted', [
		['attracted-A', { 'nominal_argument': by_adposition('to') }],
	]],
	['close', [
		['close-B', { 'nominal_argument': by_adposition('to') }],
	]],
	['content', [
		['content-A', { 'nominal_argument': by_adposition('with') }],
	]],
	['cruel', [
		['cruel-B', { 'nominal_argument': by_adposition('to') }],
	]],
	['deep', [
		['deep-A', { 'nominal_argument': unit_with_measure('length') }],
	]],
	['different', [
		['different-B', { 'nominal_argument': by_adposition('from') }],
	]],
	['each', [
		['each-A', {
			'modified_noun_with_subgroup': modified_noun_with_subgroup(),
			'other_optional': 'modified_noun_with_subgroup',
		}],
	]],
	['equal', [
		['equal-A', { 'nominal_argument': by_adposition('to') }],
	]],
	['fair', [
		['fair-A', {
			'nominal_argument': by_adposition('to'),
			'other_optional': 'nominal_argument',
			'comment': 'TODO remove the "other_optional" when the Ontology gets updated',
		}],
	]],
	['faithful', [
		['faithful-B', { 'nominal_argument': by_adposition('to') }],
		['faithful-C', { 'nominal_argument': by_adposition('with') }],
	]],
	['far', [
		['far-A', { 'nominal_argument': by_adposition('from') }],
	]],
	['few', [
		['few-A', {
			'modified_noun_with_subgroup': modified_noun_with_subgroup(),
			'other_optional': 'modified_noun_with_subgroup',
			'comment': 'TODO remove when few is marked as a Quantity',
		}],
	]],
	['full', [
		['full-B', { 'nominal_argument': by_adposition('of') }],
	]],
	['gentle', [
		['gentle-B', { 'nominal_argument': by_adposition('with|to') }],
	]],
	['guilty', [
		['guilty-A', {
			'nominal_argument': by_adposition('of'),
			'other_optional': 'nominal_argument',
			'comment': 'TODO remove the "other_optional" when the Ontology gets updated',
		}],
		['guilty-B', {
			'patient_clause_same_participant': by_same_participant_complementizer('of'),
			'patient_clause_different_participant': { 'trigger': 'none' },
		}],
	]],
	['honest', [
		['honest-A', { 'nominal_argument': by_adposition('with') }],
	]],
	['hundreds', [
		['hundreds-A', {
			'modified_noun_with_subgroup': modified_noun_with_subgroup(),
			'other_optional': 'modified_noun_with_subgroup',
			'comment': 'TODO remove when hundreds is marked as a Quantity',
		}],
	]],
	['important', [
		['important-A', { 'nominal_argument': by_adposition('to') }],
	]],
	['interested', [
		['interested-A', {
			'patient_clause_same_participant': [
				by_same_participant_complementizer('in'),
				by_clause_tag('patient_clause_same_participant'),
			],
			'patient_clause_different_participant': { 'trigger': 'none' },
		}],
	]],
	['jealous', [
		['jealous-A', { 'nominal_argument': by_adposition('of|by') }],
	]],
	['kind', [
		['kind-B', { 'nominal_argument': by_adposition('with|to') }],
	]],
	['long', [
		['long-C', { 'nominal_argument': unit_with_measure('length') }],
	]],
	['loyal', [
		['loyal-B', { 'nominal_argument': by_adposition('to') }],
	]],
	['merciful', [
		['merciful-B', { 'nominal_argument': by_adposition('to') }],
	]],
	['millions', [
		['millions-A', {
			'modified_noun_with_subgroup': modified_noun_with_subgroup(),
			'other_optional': 'modified_noun_with_subgroup',
			'comment': 'TODO remove when millions is marked as a Quantity',
		}],
	]],
	['more', [
		['more-A', {
			'modified_noun_with_subgroup': modified_noun_with_subgroup(),
			'other_optional': 'modified_noun_with_subgroup',
		}],
	]],
	['most', [
		['most-A', {
			'modified_noun_with_subgroup': modified_noun_with_subgroup(),
			'other_optional': 'modified_noun_with_subgroup',
			'comment': 'TODO remove when most is marked as a Quantity',
		}],
	]],
	['old', [
		['old-B', { 'nominal_argument': unit_with_measure('time') }],
	]],
	['one', [
		['one-A', {
			'modified_noun_with_subgroup': modified_noun_with_subgroup(),
			'other_optional': 'modified_noun_with_subgroup',
		}],
	]],
	['other', [
		['other-A', {
			'modified_noun_with_subgroup': modified_noun_with_subgroup(),
			'other_optional': 'modified_noun_with_subgroup',
		}],
	]],
	['patient', [
		['patient-B', { 'nominal_argument': by_adposition('with') }],
	]],
	['pleased', [
		['pleased-A', { 'nominal_argument': by_adposition('with') }],
	]],
	['proud', [
		['proud-B', { 'nominal_argument': by_adposition('of') }],
	]],
	['ready', [
		['ready-C', {
			'patient_clause_different_participant': [
				by_clause_tag('patient_clause_different_participant'),
				by_complementizer('for'),
			],
		}],
	]],
	['responsible', [
		['responsible-A', { 'nominal_argument': by_adposition('for') }],
	]],
	['sad', [
		['sad-A', { 'nominal_argument': by_adposition('about') }],
		['sad-B', { 'nominal_argument': by_adposition('for') }],
	]],
	['satisfied', [
		['satisfied-A', {
			'nominal_argument': by_adposition('with'),
			'other_optional': 'nominal_argument',
			'comment': 'TODO remove the "other_optional" when the Ontology gets updated',
		}],
	]],
	['several', [
		['several-A', {
			'modified_noun_with_subgroup': modified_noun_with_subgroup(),
			'other_optional': 'modified_noun_with_subgroup',
			'comment': 'TODO remove when several is marked as a Quantity',
		}],
	]],
	['similar', [
		['similar-A', {
			'nominal_argument': by_adposition('to'),
			'other_optional': 'nominal_argument',
			'comment': 'TODO remove the "other_optional" when the Ontology gets updated',
		}],
	]],
	['sorry', [
		['sorry-A', {
			'patient_clause_same_participant': [
				by_same_participant_complementizer('for'),
				by_clause_tag('patient_clause_same_participant|patient_clause_different_participant'),
			],
			'patient_clause_different_participant': { 'trigger': 'none' },
			'other_optional': 'patient_clause_same_participant',
			'comment': "support 'sorry [for doing X]', 'sorry [that they did X]', and 'sorry [to do X]'. TODO remove the 'other_optional' when the Ontology gets updated",
		}],
	]],
	['surprised', [
		['surprised-C', {
			'nominal_argument': by_adposition('by'),
			'other_optional': 'nominal_argument',
			'comment': 'TODO remove the "other_optional" when the Ontology gets updated',
		}],
	]],
	['tall', [
		// TODO change to tall-B when added to the Ontology
		['tall-A', { 'nominal_argument': unit_with_measure('length') }],
	]],
	['upset', [
		['upset-B', { 'nominal_argument': by_adposition('with') }],
		['upset-C', { 'nominal_argument': by_adposition('about') }],
	]],
	['wide', [
		['wide-B', { 'nominal_argument': unit_with_measure('length') }],
	]],
	['zealous', [
		['zealous-A', { 'nominal_argument': by_adposition('for') }],
	]],
])

function create_default_argument_rules(): ArgumentRoleRule[] {
	return Object.entries(default_adjective_case_frame_json)
		.flatMap(([role_tag, rule_json]) => parse_case_frame_rule({ sense: 'adj_default', role_tag: role_tag as RoleTag, rule_json: rule_json as RoleRuleValueJson }))
}

function create_adjective_argument_rules(): Map<WordStem, ArgumentRulesForSense[]> {
	return new Map([...adjective_case_frames.entries()].map(([stem, sense_rules_json]) =>
		[stem, parse_sense_rules({ rule_json: sense_rules_json, defaults: DEFAULT_CASE_FRAME_RULES })]))
}

const DEFAULT_CASE_FRAME_RULES = create_default_argument_rules()
const ADJECTIVE_CASE_FRAME_RULES = create_adjective_argument_rules()
const SUBGROUPABLE_CASE_FRAME_RULE = parse_case_frame_rule({ sense: 'adj_default', role_tag: 'modified_noun_with_subgroup', rule_json: modified_noun_with_subgroup() })

export function get_adjective_case_frame_rules(token: Token): CaseFrameRuleInfo {
	const stem = token.lookup_results[0].stem
	return {
		rules_by_sense: ADJECTIVE_CASE_FRAME_RULES.get(stem) ?? [],
		default_rule_getter: get_adjective_default_rules,
		role_info_getter: (categorization, role_rules) => get_adjective_usage_info({ categorization, role_rules }),
		should_check: true,
	}
}

const ADJECTIVE_LETTER_TO_ROLE = new Map([
	['A', 'modified_noun'],
	['B', 'modified_noun'],	// 'A' and 'B' are usually compatible - 'A' is attributive (the happy dog) and 'B' is a simple predicate (the dog is happy)
	['C', 'nominal_argument'],
	['D', 'patient_clause_same_participant'],
	['E', 'patient_clause_different_participant'],
])

function is_subgroupable_category(categorization: string): boolean {
	const category = categorization[0]
	// Quantity (all), Cardinal Number (7), Fractional Number (.5)
	return ['Q', 'C', 'F'].includes(category)
}

function get_adjective_default_rules(lookup: LookupResult): ArgumentRoleRule[] {
	if (is_subgroupable_category(lookup.categorization)) {
		const subgroup_index = DEFAULT_CASE_FRAME_RULES.findIndex(({ role_tag }) => role_tag === 'modified_noun_with_subgroup')
		return DEFAULT_CASE_FRAME_RULES.with(subgroup_index, SUBGROUPABLE_CASE_FRAME_RULE[0])
	}

	return DEFAULT_CASE_FRAME_RULES
}

function get_adjective_usage_info({ categorization, role_rules }: { categorization: string; role_rules: ArgumentRulesForSense }): RoleUsageInfo {
	// The first character of the categorization is the category (Generic, Quantity, Cardinal Number, etc)
	const role_letters = [...categorization.slice(1)].filter(c => c !== '_')

	// some categorizations are blank or erroneously all underscores (eg early-A)
	// treat all arguments as possible and not required
	if (role_letters.length === 0) {
		return {
			possible_roles: DEFAULT_CASE_FRAME_RULES.map(({ role_tag }) => role_tag),
			required_roles: role_rules.other_required,
		}
	}

	const possible_roles = role_letters
		.map(c => ADJECTIVE_LETTER_TO_ROLE.get(c.toUpperCase()))
		.concat(is_subgroupable_category(categorization) ? ['modified_noun_with_subgroup'] : [])
		.concat([...role_rules.other_optional, ...role_rules.other_required])
		.filter((role): role is string => Boolean(role))

	const required_roles = role_letters
		.map(c => ADJECTIVE_LETTER_TO_ROLE.get(c))
		.concat(role_rules.other_required)
		.filter((role): role is string => Boolean(role) && role !== 'modified_noun')
		// a modified noun should never be required, as usually it's possible for it to also be used predicatively

	return { possible_roles, required_roles }
}
