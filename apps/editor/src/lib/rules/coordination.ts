import { create_context_filter, create_skip_filter, create_token_filter } from '#lib/rules/rules_parser.js'
import { TOKEN_TYPE } from '#lib/token.js'
import type { Token } from '#lib/types.js'
import type { SkipJson, TokenFilter, TokenFilterJsonBase } from '#lib/rules/types.js'

export type CoordinatePosition = 'first' | 'coordinate' | 'last'
// a Noun that has a coordinator next to it, but isn't coordinated with anything
export type CoordinateTag = CoordinatePosition | 'no_partner'
export type AlternateCoordinatePosition = CoordinatePosition | 'single'

type ConjunctSearch = {
	tokens: Token[]
	index: number
	direction: -1 | 1
}

type ConjunctKind = {
	is_conjunct: TokenFilter
	find_adjacent: (search: ConjunctSearch) => number
}

type AdjacentConjunctFilters = {
	is_conjunct: TokenFilterJsonBase
	is_coordinator: TokenFilterJsonBase
	skip: SkipJson
}

const IS_NOUN_COORDINATOR = create_token_filter({ 'tag': { 'syntax': 'coord_noun|comma' } })
const SKIPPED_TOKEN_TYPES: string[] = [TOKEN_TYPE.NOTE, TOKEN_TYPE.ADDED, TOKEN_TYPE.PHRASE]
const HAS_ADPOSITION = create_token_filter({ 'tag': { 'has_adposition': 'yes' } })
const IS_MODIFIER_OR_ADPOSITION = create_skip_filter('np_modifiers_and_adpositions')
// saxon genitives, made_of and title nouns are modifiers of the next noun, and are never coordinated
const IS_COORDINATABLE_NOUN_WITHOUT_ADPOSITION: TokenFilter = token => token.tag['has_adposition'] === 'no' && !token.tag['relation']

const CONJUNCT_KINDS: ConjunctKind[] = [
	// the repeated adposition is always included, so nouns that have one are coordinated with the nearest noun that has the same one, eg 'of James and of John'
	create_noun_conjunct_kind({
		is_conjunct: HAS_ADPOSITION,
		get_search_filters: noun => {
			const has_same_adposition = (token: Token) => HAS_ADPOSITION(token) && token.tag['adposition'] === noun.tag['adposition']
			return {
				is_partner: has_same_adposition,
				// a noun with a different adposition is part of a nested phrase, eg 'James' in 'to the house of James'
				is_skipped: token => IS_MODIFIER_OR_ADPOSITION(token) || HAS_ADPOSITION(token) && !has_same_adposition(token),
			}
		},
	}),
	// without an adposition, the coordination goes to the closest noun without an adposition phrase belongs to, eg 'the brother of James and John'
	create_noun_conjunct_kind({
		is_conjunct: IS_COORDINATABLE_NOUN_WITHOUT_ADPOSITION,
		get_search_filters: () => ({
			is_partner: IS_COORDINATABLE_NOUN_WITHOUT_ADPOSITION,
			is_skipped: token => IS_MODIFIER_OR_ADPOSITION(token) || HAS_ADPOSITION(token),
		}),
	}),
	create_word_conjunct_kind({
		is_conjunct: { 'category': 'Adjective' },
		is_coordinator: { 'tag': { 'syntax': 'coord_adj|comma' } },
		skip: 'adjp_modifiers_predicative',
	}),
	create_word_conjunct_kind({
		is_conjunct: { 'category': 'Adverb' },
		is_coordinator: { 'tag': { 'syntax': 'coord_adv|comma' } },
		skip: 'advp_modifiers',
	}),
	// subordinate clauses
	{
		is_conjunct: token => {
			const clause_type = token.tag['clause_type']
			return !!clause_type && clause_type !== 'main_clause'
		},
		find_adjacent: ({ tokens, index, direction }) => {
			const clause_type = tokens[index].tag['clause_type'] ?? ''
			const context_filter = create_context_filter({
				[direction > 0 ? 'followedby' : 'precededby']: { 'tag': { 'clause_type': clause_type }, 'skip': { 'tag': { 'syntax': 'comma' } } },
			})
			const result = context_filter(tokens, index)
			return result.success ? result.context_indexes[0] : -1
		},
	},
]

/**
 * eg in 'John went to the house of James and to the store', the conjunct adjacent to 'house' is 'store'. 'James' is skipped since it is
 * part of the 'of' phrase nested inside 'house', and it is coordinated with another 'of' noun instead.
 */
function create_noun_conjunct_kind({ is_conjunct, get_search_filters }: {
	is_conjunct: TokenFilter
	get_search_filters: (noun: Token) => { is_partner: TokenFilter; is_skipped: TokenFilter }
}): ConjunctKind {
	return {
		is_conjunct,
		find_adjacent: ({ tokens, index, direction }) => {
			const { is_partner, is_skipped } = get_search_filters(tokens[index])
			const is_skipped_token = (token: Token) => SKIPPED_TOKEN_TYPES.includes(token.type) || is_skipped(token)

			const coordinator_index = find_token_index({ tokens, from: index, direction, is_target: IS_NOUN_COORDINATOR, is_skipped: is_skipped_token })
			if (coordinator_index === -1) return -1

			return find_token_index({
				tokens,
				from: coordinator_index,
				direction,
				is_target: is_partner,
				is_skipped: token => is_skipped_token(token) || IS_NOUN_COORDINATOR(token),
			})
		},
	}
}

// the first token in the direction from the given index that is the target, as long as everything in between is skipped
function find_token_index({ tokens, from, direction, is_target, is_skipped }: {
	tokens: Token[]
	from: number
	direction: -1 | 1
	is_target: TokenFilter
	is_skipped: TokenFilter
}): number {
	for (let i = from + direction; tokens[i]; i += direction) {
		if (is_target(tokens[i])) return i
		if (!is_skipped(tokens[i])) return -1
	}
	return -1
}

/**
 * eg in 'the king of Egypt, John, and many servants', the conjuncts adjacent to 'John' are 'king' and 'servants'
 */
function create_word_conjunct_kind({ is_conjunct, is_coordinator, skip }: AdjacentConjunctFilters): ConjunctKind {
	const skip_array = Array.isArray(skip) ? skip : [skip]
	// there may be both a comma and a conjunction, but there has to be at least one of them
	const following_context = create_context_filter({
		'followedby': [{ ...is_coordinator, skip }, { ...is_conjunct, skip: [...skip_array, is_coordinator] }],
	})
	const preceding_context = create_context_filter({
		'precededby': [{ ...is_conjunct, skip: [...skip_array, is_coordinator] }, { ...is_coordinator, skip }],
	})
	return {
		is_conjunct: create_token_filter(is_conjunct),
		find_adjacent: ({ tokens, index, direction }) => {
			if (direction > 0) {
				const result = following_context(tokens, index)
				return result.success ? result.context_indexes[1] : -1
			} else {
				const result = preceding_context(tokens, index)
				return result.success ? result.context_indexes[0] : -1
			}
		},
	}
}

const POSITION_BY_NEIGHBORS: Record<string, CoordinatePosition> = {
	'false|true': 'first',
	'true|true': 'coordinate',
	'true|false': 'last',
}

export function is_coordinatable(token: Token): boolean {
	return CONJUNCT_KINDS.some(({ is_conjunct }) => is_conjunct(token))
}

const IS_NOUN = create_token_filter({ 'category': 'Noun' })
const PRECEDED_BY_NOUN_COORDINATOR = create_context_filter({ 'precededby': { 'tag': { 'syntax': 'coord_noun|comma' }, 'skip': 'np_modifiers_and_adpositions' } })

/**
 * eg in 'John, Mary and Peter went', John is first, Mary is coordinate, and Peter is last.
 * A Noun with a coordinator next to it that isn't coordinated with anything is no_partner, eg 'Bethlehem' in 'went to Jerusalem and Bethlehem'.
 * Any other token that isn't coordinated with anything has no position.
 */
export function find_coordinate_position({ tokens, index }: { tokens: Token[], index: number }): CoordinateTag | undefined {
	const conjunct_kind = CONJUNCT_KINDS.find(({ is_conjunct }) => is_conjunct(tokens[index]))
	if (!conjunct_kind) return undefined

	const has_preceding = conjunct_kind.find_adjacent({ tokens, index, direction: -1 }) !== -1
	const has_following = conjunct_kind.find_adjacent({ tokens, index, direction: 1 }) !== -1
	const position = POSITION_BY_NEIGHBORS[`${has_preceding}|${has_following}`]
	if (position) return position

	if (IS_NOUN(tokens[index]) && PRECEDED_BY_NOUN_COORDINATOR(tokens, index).success) {
		return 'no_partner'
	}
	return undefined
}

const ALTERNATE_POSITION_BY_KEY: Record<string, AlternateCoordinatePosition> = {
	'undefined|complex|undefined': 'single',
	'undefined|complex|simple': 'single',
	'undefined|complex|complex': 'first',
	'simple|complex|undefined': 'single',
	'simple|complex|simple': 'single',
	'simple|complex|complex': 'first',
	'complex|complex|undefined': 'last',
	'complex|complex|simple': 'last',
	'complex|complex|complex': 'coordinate',
	'undefined|simple|undefined': 'single',
	'undefined|simple|simple': 'first',
	'undefined|simple|complex': 'single',
	'simple|simple|undefined': 'last',
	'simple|simple|simple': 'coordinate',
	'simple|simple|complex': 'last',
	'complex|simple|undefined': 'single',
	'complex|simple|simple': 'first',
	'complex|simple|complex': 'single',
}

export function find_alternate_coordinate_position({ tokens, index }: { tokens: Token[], index: number }): AlternateCoordinatePosition {
	const current = tokens[index].tag['vocabulary_alternate']
	const previous = tokens[index - 1]?.tag['vocabulary_alternate']?.split('|')[0]	// the previous clause already has its new tag
	const next = tokens[index + 1]?.tag['vocabulary_alternate']
	return ALTERNATE_POSITION_BY_KEY[`${previous}|${current}|${next}`]
}
