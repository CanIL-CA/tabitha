import { create_token_filter } from '#lib/rules/rules_parser.js'
import { TOKEN_TYPE } from '#lib/token.js'
import { PUNCTUATION_PARTICLE_STEMS } from './other_rules'
import { get_phrase_span, get_span_contents, is_np_start, is_vp_start, is_adjp_start, is_phrase_start, type ConstituentSpan } from './phrase_helpers'
import type { Sentence, Token } from '#lib/types.js'
import type { TokenFilter } from '#lib/rules/types.js'

type OrderingPosition = 'before_verb' | 'after_verb' | 'end_of_clause' | 'start_of_phrase' | 'after_head_noun' | 'after_head_adjective'
type OrderingRule = {
	readonly name: string
	readonly matches: TokenFilter
	readonly position: OrderingPosition
}

// the adpositions whose adverbial clauses belong at the end of the parent clause
const END_OF_CLAUSE_ADPOSITIONS = new Set(['because-A', 'in-order-to-A', 'so-A', 'so-C', 'just-like-A', 'instead-A', 'more-than-A', 'until-A', 'by-A', 'without-C'])

const SKIP_FILTERS: TokenFilter[] = [
	{ 'type': [TOKEN_TYPE.PUNCTUATION, TOKEN_TYPE.NOTE, TOKEN_TYPE.FUNCTION_WORD].join('|') },
	{ 'category': 'Particle', 'stem': [...PUNCTUATION_PARTICLE_STEMS].join('|') },
].map(create_token_filter)

// Each returns the index in the parent's constituents to insert at, or -1 when the position doesn't exist
const INSERT_INDEX_GETTERS: Record<OrderingPosition, (children: ConstituentSpan[]) => number> = {
	before_verb: children => children.findIndex(child => is_vp_start(child[0])),
	after_verb: children => {
		const verb_index = children.findIndex(child => is_vp_start(child[0]))
		return verb_index === -1 ? -1 : verb_index + 1
	},
	end_of_clause: children => children.findLastIndex(child => !should_skip(child[0])) + 1,
	start_of_phrase: () => 0,
	after_head_noun: children => {
		const head_index = children.findIndex(is_head_noun)
		return head_index === -1 ? -1 : head_index + 1
	},
	after_head_adjective: children => {
		const head_index = children.findIndex(is_head_adjective)
		return head_index === -1 ? -1 : head_index + 1
	},
}

/**
 * These are applied in order to the constituents of each NP.
 */
const NP_ORDERING_RULES: OrderingRule[] = [
	{
		name: 'Place pre-noun relation NPs directly after the noun they modify',
		// the relations whose NP comes before the noun it modifies, eg 'John's brother', 'King David', 'the gold statue', 'a group of people'
		matches: create_token_filter({ 'token': '{NP', 'tag': { 'relation': 'genitive_saxon|pre_head_adjunct|pre_head_of' } }),
		position: 'after_head_noun',
	},
	{
		name: 'Place adpositions at the front of the NP',
		matches: create_token_filter({ 'category': 'Adposition' }),
		position: 'start_of_phrase',
	},
	{
		name: 'Place conjunctions at the front of the NP (must be after the adposition rule so the conjunction goes first)',
		matches: create_token_filter({ 'category': 'Adposition' }),
		position: 'start_of_phrase',
	},
]

/**
 * These are applied in order to the constituents of each AdjP.
 */
const ADJP_ORDERING_RULES: OrderingRule[] = [
	{
		name: 'Place any noun argument directly after the head adjective',
		matches: create_token_filter({ 'token': '{NP' }),
		position: 'after_head_adjective',
	},
]

/**
 * These are applied in order to the constituents of each clause.
 * When multiple rules share a position, the last applied rule ends up closest to the verb,
 * or last in the clause for 'end_of_clause'.
 */
const CLAUSE_ORDERING_RULES: OrderingRule[] = [
	{
		name: 'Place the agent NP before the verb',
		matches: create_token_filter({ 'token': '{NP', 'tag': { 'role': 'agent' } }),
		position: 'before_verb',
	},
	{
		name: 'Place the patient NP directly after the verb',
		matches: create_token_filter({ 'token': '{NP', 'tag': { 'role': 'patient' } }),
		position: 'after_verb',
	},
	{
		name: 'Place an agent clause before the verb',
		matches: create_token_filter({ 'type': TOKEN_TYPE.CLAUSE, 'tag': { 'clause_type': 'agent_clause' } }),
		position: 'before_verb',
	},
	{
		name: 'Place adverb phrases at the end of the clause',
		matches: create_token_filter({ 'token': '{AdvP' }),
		position: 'end_of_clause',
	},
	{
		name: 'Place some adverbial clauses at the end of the parent clause, based on their adposition',
		matches: token => is_adverbial_clause(token)
			&& END_OF_CLAUSE_ADPOSITIONS.has(get_clause_adposition_sense(token)),
		position: 'end_of_clause',
	},
]

/**
 * This expects phrasified tokens.
 */
export function order_constituents(sentences: Sentence[]): Sentence[] {
	return sentences.map(({ clause }) => ({ clause: order_clause(clause) }))
}

function order_clause(token: Token): Token {
	if (token.type !== TOKEN_TYPE.CLAUSE) return token

	const tokens = token.sub_tokens.map(order_clause)
	return { ...token, sub_tokens: order_tokens({ tokens, rules: CLAUSE_ORDERING_RULES }) }
}

function order_tokens({ tokens, rules }: { tokens: Token[], rules: OrderingRule[] }): Token[] {
	const children = split_constituents(tokens).map(order_phrase_span)
	return apply_ordering_rules({ children, rules }).flat()
}

// Phrases are ordered from the inside out. Only NPs have ordering rules, but every phrase is searched for NPs inside it.
function order_phrase_span(span: ConstituentSpan): ConstituentSpan {
	if (!is_phrase_start(span[0])) return span

	const rules_by_category: [TokenFilter, OrderingRule[]][] = [
		[is_np_start, NP_ORDERING_RULES],
		[is_adjp_start, ADJP_ORDERING_RULES],
	]

	const rules = rules_by_category.find(([filter]) => filter(span[0]))?.[1] ?? []
	return [span[0], ...order_tokens({ tokens: get_span_contents(span), rules }), span[span.length - 1]]
}

function split_constituents(tokens: Token[]): ConstituentSpan[] {
	const constituents: ConstituentSpan[] = []
	for (let i = 0; i < tokens.length; i += constituents[constituents.length - 1].length) {
		constituents.push(get_phrase_span({ tokens, start_index: i }))
	}
	return constituents
}

function apply_ordering_rules({ children, rules }: { children: ConstituentSpan[], rules: OrderingRule[] }): ConstituentSpan[] {
	return rules.reduce((ordered_children, rule) => apply_ordering_rule({ children: ordered_children, rule }), children)
}

function apply_ordering_rule({ children, rule }: { children: ConstituentSpan[], rule: OrderingRule }): ConstituentSpan[] {
	const to_move = children.filter(child => rule.matches(child[0]))
	if (!to_move.length) return children

	const remaining = children.filter(child => !rule.matches(child[0]))
	const insert_index = INSERT_INDEX_GETTERS[rule.position](remaining)
	if (insert_index === -1) return children

	return [...remaining.slice(0, insert_index), ...to_move, ...remaining.slice(insert_index)]
}

const is_noun = create_token_filter({ 'category': 'Noun' })
const is_adjective = create_token_filter({ 'category': 'Adjective' })

// nested NPs are multi-token spans, so only the NP's own noun is a single token
const is_head_noun = (child: ConstituentSpan): boolean => child.length === 1 && is_noun(child[0])

const is_head_adjective = (child: ConstituentSpan): boolean => child.length === 1 && is_adjective(child[0])

const is_adverbial_clause = create_token_filter({ 'type': TOKEN_TYPE.CLAUSE, 'tag': { 'clause_type': 'adverbial_clause' } })

function should_skip(token: Token): boolean {
	return SKIP_FILTERS.some(filter => filter(token))
}

const is_adposition = create_token_filter({ 'category': 'Adposition' })

function get_clause_adposition_sense(clause: Token): string {
	const adposition = clause.sub_tokens.find(is_adposition)?.lookup_results[0]
	return adposition ? `${adposition.stem}-${adposition.sense}` : ''
}
