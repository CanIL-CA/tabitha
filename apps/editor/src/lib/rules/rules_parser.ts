import { TOKEN_TYPE, set_message, token_has_tag } from '#lib/token.js'
import type { CheckerTokenType } from '@tabitha/types'
import type { MessageInfo, Token, Tag } from '#lib/types.js'
import type {
	BuiltInRule,
	ContextFilterResult,
	ContextMatch,
	LookupFilter,
	RuleAction,
	RuleTriggerContext,
	SkipGroup,
	SkipJson,
	SkipJsonSingle,
	TokenContextFilter,
	TokenContextFilterJson,
	TokenFilter,
	TokenFilterJson,
	TokenFilterJsonForContext,
	TokenFilterWithSkipJson,
	TokenRule,
	TokenTransform,
	TokenTransformJson,
} from '#lib/rules/types.js'

export function create_token_filter(filter_json: TokenFilterJson | undefined): TokenFilter {
	if (filter_json === undefined || filter_json === 'none') {
		return () => false
	}
	if (filter_json === 'all') {
		return () => true
	}

	const filters: TokenFilter[] = []

	add_value_filter({ property_value: filter_json['token'], value_getter: token => token.token })
	add_value_filter({ property_value: filter_json['type'], value_getter: token => token.type })

	// a token tag can have | separated values
	const tag_json = filter_json['tag']
	if (tag_json !== undefined) {
		filters.push(token => token_has_tag({ token, tag_to_check: tag_json }))
	}

	add_lookup_filter({
		property_value: filter_json['stem'],
		lookup_filter_getter: filter_value => {
			const value_checker = get_value_checker(filter_value)
			return lookup => value_checker(lookup.stem)
		},
	})
	add_lookup_filter({
		property_value: filter_json['category'],
		lookup_filter_getter: filter_value => {
			const value_checker = get_value_checker(filter_value.toLowerCase())
			return lookup => value_checker(lookup.part_of_speech.toLowerCase())
		},
	})
	add_lookup_filter({
		property_value: filter_json['level'],
		lookup_filter_getter: filter_value => {
			const value_checker = get_value_checker(filter_value)
			return lookup => value_checker(`${lookup.level}`)
		},
	})

	add_lookup_filter({
		property_value: filter_json['form'],
		lookup_filter_getter: filter_value => {
			const filter_forms = filter_value.split('|')
			return lookup => {
				const lookup_forms = lookup.form.split('|')
				return lookup_forms.some(form => filter_forms.includes(form))
			}
		},
	})

	return token => filters.every(filter => filter(token))

	function add_value_filter({ property_value, value_getter }: { property_value: string | undefined; value_getter: (token: Token) => string }) {
		if (property_value !== undefined) {
			const value_checker = get_value_checker(property_value)
			filters.push(token => value_checker(value_getter(token)))
		}
	}

	function add_lookup_filter({ property_value, lookup_filter_getter }: { property_value: string | undefined; lookup_filter_getter: (json: string) => LookupFilter }) {
		if (property_value !== undefined) {
			const lookup_filter = lookup_filter_getter(property_value)
			filters.push(token => token.lookup_results.length > 0 && token.lookup_results.every(lookup_filter))
		}
	}

	function get_value_checker(filter_value: string): (value: string) => boolean {
		const filter_values = filter_value.split('|')
		if (filter_values.length > 1) {
			return value => filter_values.includes(value)
		}
		return value => value === filter_value
	}
}

export function create_context_filter(context_json: TokenContextFilterJson | undefined): TokenContextFilter {
	if (context_json === undefined) {
		return () => context_match({})
	}

	const filters: TokenContextFilter[] = []

	const preceded_by = context_json['precededby']
	if (preceded_by !== undefined) {
		filters.push(create_directional_context_filter({ context_json: preceded_by, offset: -1 }))
	}

	const not_preceded_by = context_json['notprecededby']
	if (not_preceded_by !== undefined) {
		filters.push(negate(create_directional_context_filter({ context_json: not_preceded_by, offset: -1 })))
	}

	const followed_by = context_json['followedby']
	if (followed_by !== undefined) {
		filters.push(create_directional_context_filter({ context_json: followed_by, offset: +1 }))
	}

	const not_followed_by = context_json['notfollowedby']
	if (not_followed_by !== undefined) {
		filters.push(negate(create_directional_context_filter({ context_json: not_followed_by, offset: +1 })))
	}

	const subtokens = context_json['subtokens']
	if (subtokens !== undefined) {
		filters.push(create_subtokens_filter(subtokens))
	}

	if (filters.length === 0) {
		return () => context_match({})
	} else if (filters.length === 1) {
		return (tokens, start_index) => filters[0](tokens, start_index)
	} else {
		return combine(filters)
	}

	function negate(filter: TokenContextFilter): TokenContextFilter {
		return (tokens, start_index) => filter(tokens, start_index).success ? NO_CONTEXT_MATCH : context_match({})
	}

	function combine(filters: TokenContextFilter[]): TokenContextFilter {
		return (tokens, start_index) => {
			const results = filters.map(filter => filter(tokens, start_index))
			if (results.every((result): result is ContextMatch => result.success)) {
				return context_match({
					context_indexes: results.flatMap(result => result.context_indexes),
					subtoken_indexes: results.flatMap(result => result.subtoken_indexes),
				})
			} else {
				return NO_CONTEXT_MATCH
			}
		}
	}

	function create_subtokens_filter(subtoken_json: TokenFilterJsonForContext): TokenContextFilter {
		const subtoken_filter = create_directional_context_filter({ context_json: subtoken_json, offset: +1 })

		return (tokens, start_index) => {
			if (tokens[start_index].sub_tokens.length === 0) {
				return NO_CONTEXT_MATCH
			}

			const clause = tokens[start_index]
			const result = subtoken_filter(clause.sub_tokens, -1)	// use -1 so that the checks start at 0
			return result.success ? context_match({ subtoken_indexes: result.context_indexes }) : result
		}
	}
}

function create_directional_context_filter({ context_json, offset }: { context_json: TokenFilterJsonForContext; offset: number }): TokenContextFilter {
	if (Array.isArray(context_json)) {
		const filters = context_json.map(filter_json => create_single_context_filter({ context_json: filter_json, offset }))
		// precededby filters have the first element be the furthest from the trigger,
		// and the last element is closest to the trigger.
		return offset < 0 ? create_reversed_multi_context_filter(filters) : create_multi_context_filter(filters)
	} else {
		return create_single_context_filter({ context_json, offset })
	}

	function create_multi_context_filter(filters: TokenContextFilter[]): TokenContextFilter {
		return (tokens, start_index) => {
			const all_indexes: number[] = []
			for (const filter of filters) {
				const result = filter(tokens, start_index)
				if (!result.success) {
					return NO_CONTEXT_MATCH
				}
				start_index = result.context_indexes[0]
				all_indexes.push(start_index)
			}

			return context_match({ context_indexes: all_indexes })
		}
	}

	function create_reversed_multi_context_filter(filters: TokenContextFilter[]): TokenContextFilter {
		const reversed_filters = [...filters].reverse()

		return (tokens, start_index) => {
			const all_indexes: number[] = []
			for (const filter of reversed_filters) {
				const result = filter(tokens, start_index)
				if (!result.success) {
					return NO_CONTEXT_MATCH
				}
				start_index = result.context_indexes[0]
				all_indexes.push(start_index)
			}

			return context_match({ context_indexes: all_indexes.reverse() })
		}
	}

	function create_single_context_filter({ context_json, offset }: { context_json: TokenFilterWithSkipJson; offset: number }): TokenContextFilter {
		const filter = create_token_filter(context_json)

		const skip_filter: TokenFilter = context_json['skip'] !== undefined
			? create_skip_filter(context_json['skip'])
			: () => false

		const end_check: (tokens: Token[], i: number) => boolean = offset < 0 ? (_, i) => i >= 0 : (tokens, i) => i < tokens.length

		return (tokens, start_index) => check_context_with_skip({ tokens, start_index })

		function check_context_with_skip({ tokens, start_index }: { tokens: Token[]; start_index: number }): ContextFilterResult {
			const tokens_to_skip: CheckerTokenType[] = [TOKEN_TYPE.NOTE, TOKEN_TYPE.ADDED, TOKEN_TYPE.PHRASE]

			for (let i = start_index + offset; end_check(tokens, i); i += offset) {
				if (filter(tokens[i])) {
					return context_match({ context_indexes: [i] })
				}
				if (!skip_filter(tokens[i]) && !tokens_to_skip.includes(tokens[i].type)) {
					return NO_CONTEXT_MATCH
				}
			}
			return NO_CONTEXT_MATCH
		}
	}
}

/**
 * Skip can have one token filter or an array of filters which act as OR conditions.
 * Skip can also use preset groups useful for skipping phrases and parts of phrases.
 */
export function create_skip_filter(skip_json: SkipJson): TokenFilter {
	if (typeof skip_json === 'string' && !['all', 'none'].includes(skip_json)) {
		return create_skip_filter(SKIP_GROUPS.get(skip_json as SkipGroup) ?? [])
	}
	if (Array.isArray(skip_json)) {
		const filters = skip_json.map(create_skip_filter)
		return token => filters.some(filter => filter(token))
	}
	return create_token_filter(skip_json as TokenFilterJson)
}

const NO_CONTEXT_MATCH: ContextFilterResult = { success: false }

function context_match(
	{ context_indexes = [], subtoken_indexes = [] }: { context_indexes?: number[]; subtoken_indexes?: number[] },
): ContextMatch {
	return { success: true, context_indexes, subtoken_indexes }
}

export function create_token_transforms(transform_json: TokenTransformJson | TokenTransformJson[] | undefined): TokenTransform[] {
	if (transform_json === undefined) {
		return []
	} else if (Array.isArray(transform_json)) {
		return transform_json.map(create_token_transform)
	} else {
		return [create_token_transform(transform_json)]
	}
}

export function create_token_transform(transform_json: TokenTransformJson | undefined): TokenTransform {
	if (transform_json === undefined) {
		return token => token
	}

	const transforms: TokenTransform[] = []

	const type = transform_json['type']
	if (type !== undefined) {
		transforms.push(token => ({ ...token, type }))
	}

	const tag = transform_json['tag']
	if (tag !== undefined) {
		transforms.push(token => ({ ...token, tag: add_value_to_tag({ old_tag: token.tag, new_values: tag }) }))
	}

	const remove_tag = transform_json['remove_tag']
	if (remove_tag !== undefined) {
		transforms.push(token => ({ ...token, tag: remove_tag_labels({ old_tag: token.tag, tags_to_remove: remove_tag }) }))
	}

	const function_tag = transform_json['function']
	if (function_tag !== undefined) {
		transforms.push(token => ({
			...token,
			type: TOKEN_TYPE.FUNCTION_WORD,
			tag: add_value_to_tag({ old_tag: token.tag, new_values: function_tag }),
			lookup_results: [],
		}))
	}

	if (transforms.length === 0) {
		return token => token
	} else if (transforms.length === 1) {
		return transforms[0]
	} else {
		return token => transforms.reduce((new_token, transform) => transform(new_token), token)
	}

	function add_value_to_tag({ old_tag, new_values }: { old_tag: Tag; new_values: Tag }): Tag {
		return { ...old_tag, ...new_values }
	}

	function remove_tag_labels({ old_tag, tags_to_remove }: { old_tag: Tag; tags_to_remove: string | string[] }): Tag {
		if (!Array.isArray(tags_to_remove)) {
			tags_to_remove = [tags_to_remove]
		}
		return Object.fromEntries(Object.entries(old_tag).filter(([k]) => !tags_to_remove.includes(k)))
	}
}

export function simple_rule_action(action: (trigger_context: RuleTriggerContext) => void): RuleAction {
	return trigger_context => {
		action(trigger_context)
		return trigger_context.trigger_index + 1
	}
}

export function message_set_action(action: (trigger_context: RuleTriggerContext) => Iterable<MessageInfo> | MessageInfo | undefined): RuleAction {
	return trigger_context => {
		const result = action(trigger_context)
		if (result === undefined) {
			return trigger_context.trigger_index + 1
		}

		if (Symbol.iterator in result) {
			[...result].forEach(message => set_message({ trigger_context, message_info: message }))
		} else {
			set_message({ trigger_context, message_info: result })
		}

		return trigger_context.trigger_index + 1
	}
}

export function from_built_in_rule(group_name: string): (rule: BuiltInRule, index: number) => TokenRule {
	return (rule, index) => ({
		id: `${group_name}:built-in:${index}`,
		name: rule.name,
		...rule.rule,
	})
}

const SKIP_GROUPS = new Map<SkipGroup, SkipJsonSingle[]>([
	['clause_start', [
		{ 'token': '[' },
		{ 'token': '"' },
		{ 'tag': { 'syntax': 'coord_clause' } },
		{ 'category': 'Conjunction' },
	]],
	['adjp_modifiers_predicative', [
		{
			'tag': [
				'degree',
				{ 'clause_type': 'patient_clause_same_participant|patient_clause_different_participant' }, // some adjectives can take a patient argument
			],
		},
		{ 'category': 'Adverb' },
	]],
	['adjp_predicative', [
		'adjp_modifiers_predicative',
		{ 'tag': { 'syntax': 'coord_adj|comma' } },
		{ 'category': 'Adjective' },
	]],
	['adjp_modifiers_attributive', [
		{ 'tag': 'degree' },
	]],
	['adjp_attributive', [
		'adjp_modifiers_attributive',
		{ 'tag': { 'syntax': 'coord_adj|comma' } },
		{ 'category': 'Adjective' },
	]],
	['advp_modifiers', [
		{ 'tag': 'degree' },
	]],
	['advp', [
		'advp_modifiers',
		{ 'tag': { 'syntax': 'coord_adv|comma' } },
		{ 'category': 'Adverb' },
	]],
	['np_modifiers', [
		{ 'tag': ['determiner|relation', { 'clause_type': 'relative_clause' }] },
		'adjp_attributive',
	]],
	['np', [
		'np_modifiers',
		{ 'tag': { 'syntax': 'coord_noun|comma' } },
		{ 'category': 'Noun' },
	]],
	['vp_modifiers', [
		{ 'tag': ['verb_polarity|modal|auxiliary', { 'syntax': 'infinitive|gerundifier' }] },
		'advp',
		{ 'category': 'Particle', 'stem': 'please' },
	]],
	['vp', [
		'vp_modifiers',
		{ 'category': 'Verb' },
	]],
])
