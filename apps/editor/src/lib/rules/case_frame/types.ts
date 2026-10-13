import type { CaseFrameStatus } from '@tabitha/types'
import type { LookupResult, Tag } from '#lib/types.js'
import type { RuleTriggerContext, TokenRule, TransformRuleJson, TokenFilterJsonBase, TokenContextFilterJson } from '#lib/rules/types.js'

export type RoleTag = string

export type WordSense = string
export type WordStem = string

export type ArgumentRoleRule = {
	role_tag: RoleTag
	// if the trigger rule is relative to the trigger word, this index tells the rule which context index the argument is at
	relative_context_index: number
	trigger_rule: TokenRule
	missing_message: string
	extra_message: string
	main_word_tag: Tag | null
}

export type ArgumentRulesForSense = {
	sense: WordSense
	role_rules: ArgumentRoleRule[]
	other_required: RoleTag[]
	other_optional: RoleTag[]
	patient_clause_type: RoleTag
}

export type DefaultRuleGetter = (lookup: LookupResult) => ArgumentRoleRule[]
export type RoleInfoGetter = (categorization: string, role_rules: ArgumentRulesForSense) => RoleUsageInfo

export type CaseFrameRuleInfo = {
	rules_by_sense: ArgumentRulesForSense[]
	default_rule_getter: DefaultRuleGetter
	role_info_getter: RoleInfoGetter
	should_check: boolean
}

export type CaseFrame = {
	rules: ArgumentRoleRule[]
	usage: RoleUsageInfo
	result: CaseFrameResult
}

export type RoleUsageInfo = {
	possible_roles: RoleTag[]
	required_roles: RoleTag[]
}

export type RoleMatchResult = {
	role_tag: RoleTag
	success: boolean
	trigger_context: RuleTriggerContext
	rule: ArgumentRoleRule
}

export type CaseFrameResult = {
	status: CaseFrameStatus
	valid_arguments: RoleMatchResult[]
	extra_arguments: RoleMatchResult[]
	missing_arguments: RoleTag[]
}

export type CaseFrameRuleJson = TransformRuleJson & {
	tag_role?: boolean
	main_word_tag?: Tag
	argument_context_index?: number
	missing_message?: string
	extra_message?: string
}

export type RoleRuleValueJson = CaseFrameRuleJson | CaseFrameRuleJson[]

export type VerbRoleTag =
	| 'agent'
	| 'patient'
	| 'state'
	| 'source'
	| 'destination'
	| 'instrument'
	| 'beneficiary'
	| 'predicate_adjective'
	| 'agent_clause'
	| 'patient_clause_different_participant'
	| 'patient_clause_same_participant'
	| 'patient_clause_simultaneous'
	| 'patient_clause_quote_begin'

export type AdjectiveRoleTag =
	| 'modified_noun'
	| 'modified_noun_with_subgroup'
	| 'nominal_argument'
	| 'patient_clause_different_participant'
	| 'patient_clause_same_participant'

export type AdpositionRoleTag = 'opening_subordinate_clause' | 'in_noun_phrase'
export type OtherRoleTag = RoleTag

export type SenseRuleJsonBase = {
	patient_clause_type?: string
	other_rules?: { [other_tag: OtherRoleTag]: RoleRuleValueJson }
	other_required?: RoleTag
	other_optional?: RoleTag
	comment?: string
}

export type RoleRuleJson<K extends string = string> = {
	[key in K]?: RoleRuleValueJson
}

export type SenseRuleJson<K extends string = string> = SenseRuleJsonBase & RoleRuleJson<K>

export type ArgumentMatchFilter = (role_matches: RoleMatchResult[]) => boolean

export type RoleFilterRuleJson = TokenFilterJsonBase & {
	context?: TokenContextFilterJson
}

export type SensePriorityOverrideJson = Record<string, RoleFilterRuleJson>
export type PriorityOverrideRule = [WordSense, SensePriorityOverrideJson]
export type WordStemPriorityOverrides = [WordStem, PriorityOverrideRule[]]
