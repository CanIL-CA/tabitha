import type { CaseFrameRuleJson } from '#lib/rules/case_frame/types.js'
import type { TokenContextFilterJson } from '#lib/rules/types.js'
export function opening_subordinate_clause() {
	return {
		...by_relative_context({
			'precededby': { 'token': '[', 'skip': { 'tag': { 'syntax': 'coord_clause' } } },
		}),
		'tag_role': false,
		'main_word_tag': { 'syntax': 'adverbial_clause_adposition' },
	}
}

export function head_noun() {
	return {
		...by_relative_context({
			'followedby': { 'tag': { 'syntax': 'head_np' }, 'skip': 'np_modifiers' },
		}),
		'tag_role': false,
		'main_word_tag': { 'pre_np_adposition': 'oblique' },
	}
}

export function head_noun_post() {
	return {
		...by_relative_context({
			'precededby': { 'tag': { 'syntax': 'head_np' }, 'skip': 'np_modifiers' },
		}),
		'tag_role': false,
		'main_word_tag': { 'post_np_adposition': 'oblique' },
		'missing_message': "'X {stem}'",
	}
}

export function by_relative_context(relative_context: TokenContextFilterJson): CaseFrameRuleJson {
	return {
		'trigger': 'all',
		'context': relative_context,
		'argument_context_index': 0,
	}
}
