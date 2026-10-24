import { create_context_filter, create_token_filter } from '#lib/rules/rules_parser.js'
import type { Token } from '#lib/types.js'
import type { SkipJson, TokenFilter, TokenFilterJsonBase } from '#lib/rules/types.js'

export type CoordinatePosition = 'first' | 'coordinate' | 'last'
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

const CONJUNCT_KINDS: ConjunctKind[] = [
	create_word_conjunct_kind({
		is_conjunct: { 'tag': { 'syntax': 'head_np' } },
		is_coordinator: { 'tag': { 'syntax': 'coord_noun|comma' } },
		skip: 'np_modifiers',
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
 * eg in 'the king of Egypt, John, and many servants', the conjuncts adjacent to 'John' are 'king' and 'servants'
 */
function create_word_conjunct_kind({ is_conjunct, is_coordinator, skip }: AdjacentConjunctFilters): ConjunctKind {
	const following_context = create_context_filter({
		'followedby': [{ ...is_coordinator, skip }, { ...is_conjunct, skip }],
	})
	const preceding_context = create_context_filter({
		'precededby': [{ ...is_conjunct, skip }, { ...is_coordinator, skip }],
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

/**
 * eg in 'John, Mary and Peter went', John is first, Mary is coordinate, and Peter is last.
 * A token that isn't coordinated with anything has no position.
 */
export function find_coordinate_position({ tokens, index }: { tokens: Token[], index: number }): CoordinatePosition | undefined {
	const conjunct_kind = CONJUNCT_KINDS.find(({ is_conjunct }) => is_conjunct(tokens[index]))
	if (!conjunct_kind) return undefined

	const has_preceding = conjunct_kind.find_adjacent({ tokens, index, direction: -1 }) !== -1
	const has_following = conjunct_kind.find_adjacent({ tokens, index, direction: 1 }) !== -1
	return POSITION_BY_NEIGHBORS[`${has_preceding}|${has_following}`]
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
