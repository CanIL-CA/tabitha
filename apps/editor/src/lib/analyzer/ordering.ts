import { create_token_filter } from '#lib/rules/rules_parser.js'
import { TOKEN_TYPE } from '#lib/token.js'
import { PUNCTUATION_PARTICLE_STEMS } from './other_rules'
import type { Sentence, Token } from '#lib/types.js'
import type { TokenFilter } from '#lib/rules/types.js'

/**
 * A constituent is either a single token (eg. a clause, conjunction or particle), or a phrase span
 * of tokens starting with its opening phrase token (eg. '{NP') and ending with its closing '}'.
 */
type Constituent = Token[]
// type ConstituentFilter = (constituent: Constituent) => boolean

type OrderingPosition = 'before_verb' | 'after_verb' | 'end_of_clause'
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

// Each returns the index in the clause's constituents to insert at, or -1 when the position doesn't exist
const INSERT_INDEX_GETTERS: Record<OrderingPosition, (children: Constituent[]) => number> = {
	before_verb: children => children.findIndex(child => is_verb_phrase(child[0])),
	after_verb: children => {
		const verb_index = children.findIndex(child => is_verb_phrase(child[0]))
		return verb_index === -1 ? -1 : verb_index + 1
	},
	end_of_clause: children => children.findLastIndex(child => !should_skip(child[0])) + 1,
}

/**
 * These are applied in order to the constituents of each clause.
 * When multiple rules share a position, the last applied rule ends up closest to the verb,
 * or last in the clause for 'end_of_clause'.
 */
const ORDERING_RULES: OrderingRule[] = [
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

	const children = split_constituents(token.sub_tokens.map(order_clause))
	return { ...token, sub_tokens: apply_ordering_rules(children).flat() }
}

function split_constituents(tokens: Token[]): Constituent[] {
	const constituents: Constituent[] = []
	let depth = 0

	for (const token of tokens) {
		if (depth === 0) {
			constituents.push([])
		}
		constituents[constituents.length - 1].push(token)
		depth = Math.max(0, depth + get_depth_change(token))
	}

	return constituents
}

function get_depth_change(token: Token): number {
	if (token.type !== TOKEN_TYPE.PHRASE) return 0
	return token.token === '}' ? -1 : 1
}

function apply_ordering_rules(children: Constituent[]): Constituent[] {
	return ORDERING_RULES.reduce((ordered_children, rule) => apply_ordering_rule({ children: ordered_children, rule }), children)
}

function apply_ordering_rule({ children, rule }: { children: Constituent[], rule: OrderingRule }): Constituent[] {
	const to_move = children.filter(child => rule.matches(child[0]))
	if (!to_move.length) return children

	const remaining = children.filter(child => !rule.matches(child[0]))
	const insert_index = INSERT_INDEX_GETTERS[rule.position](remaining)
	if (insert_index === -1) return children

	return [...remaining.slice(0, insert_index), ...to_move, ...remaining.slice(insert_index)]
}

const is_verb_phrase = create_token_filter({ 'token': '{VP' })

const is_adverbial_clause = create_token_filter({ 'type': TOKEN_TYPE.CLAUSE, 'tag': { 'clause_type': 'adverbial_clause' } })

function should_skip(token: Token): boolean {
	return SKIP_FILTERS.some(filter => filter(token))
}

function get_clause_adposition_sense(clause: Token): string {
	const is_adposition = create_token_filter({ 'category': 'Adposition' })
	const adposition = clause.sub_tokens.find(is_adposition)?.lookup_results[0]
	return adposition ? `${adposition.stem}-${adposition.sense}` : ''
}
