import { TOKEN_TYPE } from '#lib/token.js'
import type { CaseFrameRuleJson } from '#lib/rules/case_frame/types.js'
import type { TokenContextFilterJson } from '#lib/rules/types.js'

export function modified_noun_with_subgroup() {
	return {
		...by_relative_context({
			'followedby': [
				{ 'token': 'of' },
				{ 'tag': { 'syntax': 'head_np' }, 'skip': 'np_modifiers' },
			],
		}),
		'argument_context_index': 1,
		'context_transform': { 'function': { 'relation': 'subgroup' }, 'remove_tag': 'pre_np_adposition' },
		'main_word_tag': { 'adj_usage': 'attributive', 'adj_type': 'subgroup' },
		'tag_role': false,
		'comment': "eg 'all X' and 'all of X' are both supported",
	}
}

export function by_adposition(adposition: string): CaseFrameRuleJson {
	return {
		...by_relative_context({
			'followedby': [
				{ 'token': adposition },
				{ 'tag': { 'syntax': 'head_np' }, 'skip': 'np_modifiers' },
			],
		}),
		'argument_context_index': 1,
		'transform': { 'tag': { 'role': 'adjective_nominal_argument', 'syntax': 'nested_np' } },
		'context_transform': { 'function': { 'pre_np_adposition': 'adjective_argument' }, 'remove_tag': 'relation' },
		'missing_message': `'{stem} ${adposition} N'`,
	}
}

export function by_clause_tag(clause_type: string): CaseFrameRuleJson {
	return {
		...by_relative_context({
			'followedby': { 'type': TOKEN_TYPE.CLAUSE, 'tag': { 'clause_type': clause_type, 'role': 'none' } },
		}),
		'transform': { 'tag': { 'role': 'adjective_clausal_argument' } },
		'comment': 'the clause should immediately follow the adjective',	// TODO is this true?
	}
}

export function by_complementizer(complementizer: string): CaseFrameRuleJson {
	return {
		'trigger': { 'type': TOKEN_TYPE.CLAUSE, 'tag': { 'clause_type': 'adverbial_clause' } },
		'context': {
			'subtokens': { 'token': complementizer, 'skip': 'clause_start' },
		},
		'transform': { 'tag': { 'clause_type': 'patient_clause_different_participant', 'role': 'adjective_clausal_argument' } },
		'subtoken_transform': { 'function': { 'syntax': 'complementizer' } },
	}
}

export function by_same_participant_complementizer(complementizer: string): CaseFrameRuleJson {
	return {
		'trigger': { 'type': TOKEN_TYPE.CLAUSE, 'tag': { 'clause_type': 'adverbial_clause|patient_clause_same_participant' } },
		'context': {
			'subtokens': { 'token': complementizer, 'skip': 'clause_start' },
		},
		'transform': { 'tag': { 'clause_type': 'patient_clause_same_participant', 'role': 'adjective_clausal_argument' } },
		'subtoken_transform': { 'function': { 'syntax': 'complementizer' } },
		'missing_message': `'[${complementizer} Verb-ing]'`,
	}
}

export function modified_noun_of_adjective(): CaseFrameRuleJson { 
	return {
		...by_relative_context({
			'followedby': { 'category': 'Noun', 'skip': 'np_modifiers' },
			'notfollowedby': { 'token': 'of' },
		}),
		'tag_role': false,
		'main_word_tag': { 'adj_usage': 'attributive', 'adj_type': 'regular' },
		'comment': '"of" is a relation that can be part of an NP, but is also used for some nominal arguments and should not be skipped if it immediately follows the Adj (eg. John was afraid of Mary)',
	}
}

export function unit_with_measure(unit_type: string): CaseFrameRuleJson {
	return {
		...by_relative_context({
			'precededby': { 'category': 'Noun' },
		}),
		'transform': { 'tag': { 'role': 'adjective_nominal_argument', 'syntax': 'nested_np' } },
		'main_word_tag': { 'adj_type': 'measure' },
		'missing_message': `write 'N X {stem}' where N is a number/quantity and X is a unit of ${unit_type}`,
	}
}

function by_relative_context(relative_context: TokenContextFilterJson): CaseFrameRuleJson {
	return {
		'trigger': 'all',
		'context': relative_context,
		'argument_context_index': 0,
	}
}