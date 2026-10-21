import { PUNCTUATION_PARTICLE_STEMS } from './other_rules'
import type { EditorAnalyzedEntity, FeatureName, FeatureValue, SourceEntityCategory } from '@tabitha/types'

/**
 * A constituent is either a single entity (eg. a conjunction or particle), or a bracketed span
 * of entities starting with its opening entity '(', '[', '{' and ending with its closing entity.
 */
type Constituent = EditorAnalyzedEntity[]
type ConstituentFilter = (constituent: Constituent) => boolean

type OrderingPosition = 'before_verb' | 'after_verb' | 'end_of_clause'
type OrderingRule = {
	readonly name: string
	readonly matches: ConstituentFilter
	readonly position: OrderingPosition
}

const OPENING_VALUES = new Set(['{', '[', '('])
const CLOSING_VALUES = new Set(['}', ']', ')'])

// the adpositions whose adverbial clauses belong at the end of the parent clause
const END_OF_CLAUSE_ADPOSITIONS = new Set(['because-A', 'in-order-to-A', 'so-A', 'so-C', 'just-like-A', 'instead-A', 'more-than-A', 'until-A', 'by-A', 'without-C'])

// Each returns the index in the clause's constituents to insert at, or -1 when the position doesn't exist
const INSERT_INDEX_GETTERS: Record<OrderingPosition, (children: Constituent[]) => number> = {
	before_verb: children => children.findIndex(is_verb_phrase),
	after_verb: children => {
		const verb_index = children.findIndex(is_verb_phrase)
		return verb_index === -1 ? -1 : verb_index + 1
	},
	end_of_clause: children => children.findLastIndex(child => !is_punctuation(child)) + 1,
}

/**
 * These are applied in order to the constituents of each clause.
 * When multiple rules share a position, the last applied rule ends up closest to the verb,
 * or last in the clause for 'end_of_clause'.
 */
const ORDERING_RULES: OrderingRule[] = [
	{
		name: 'Place the agent NP before the verb',
		matches: by_head_feature({ category: 'Noun Phrase', name: 'Semantic Role', value: 'Most Agent-like' }),
		position: 'before_verb',
	},
	{
		name: 'Place the patient NP directly after the verb',
		matches: by_head_feature({ category: 'Noun Phrase', name: 'Semantic Role', value: 'Most Patient-like' }),
		position: 'after_verb',
	},
	{
		name: 'Place an agent clause before the verb',
		matches: by_head_feature({ category: 'Clause', name: 'Type', value: 'Agent (Subject Complement)' }),
		position: 'before_verb',
	},
	{
		name: 'Place adverb phrases at the end of the clause',
		matches: ([head]) => head.category === 'Adverb Phrase',
		position: 'end_of_clause',
	},
	{
		name: 'Place some adverbial clauses at the end of the parent clause, based on their adposition',
		matches: constituent => is_adverbial_clause(constituent)
			&& END_OF_CLAUSE_ADPOSITIONS.has(get_clause_adposition_sense(constituent)),
		position: 'end_of_clause',
	},
]

export function order_entities(entities: EditorAnalyzedEntity[]): EditorAnalyzedEntity[] {
	return split_constituents(entities).flatMap(order_constituent)
}

function order_constituent(constituent: Constituent): Constituent {
	const opening = constituent[0]
	const closing = constituent[constituent.length - 1]
	if (constituent.length < 2 || !is_opening(opening) || !is_closing(closing)) {
		return constituent
	}

	const children = split_constituents(constituent.slice(1, -1)).map(order_constituent)
	const ordered_children = opening.category === 'Clause' ? apply_ordering_rules(children) : children
	return [opening, ...ordered_children.flat(), closing]
}

function split_constituents(entities: EditorAnalyzedEntity[]): Constituent[] {
	const constituents: Constituent[] = []
	let depth = 0

	for (const entity of entities) {
		if (depth === 0) {
			constituents.push([])
		}
		constituents[constituents.length - 1].push(entity)
		depth = Math.max(0, depth + get_depth_change(entity))
	}

	return constituents
}

function get_depth_change(entity: EditorAnalyzedEntity): number {
	if (is_opening(entity)) return 1
	if (is_closing(entity)) return -1
	return 0
}

function is_opening(entity: EditorAnalyzedEntity): boolean {
	return entity.concept === null && OPENING_VALUES.has(entity.value)
}

function is_closing(entity: EditorAnalyzedEntity): boolean {
	return entity.concept === null && CLOSING_VALUES.has(entity.value)
}

function apply_ordering_rules(children: Constituent[]): Constituent[] {
	return ORDERING_RULES.reduce((ordered_children, rule) => apply_ordering_rule({ children: ordered_children, rule }), children)
}

function apply_ordering_rule({ children, rule }: { children: Constituent[]; rule: OrderingRule }): Constituent[] {
	const to_move = children.filter(rule.matches)
	if (!to_move.length) return children

	const remaining = children.filter(child => !rule.matches(child))
	const insert_index = INSERT_INDEX_GETTERS[rule.position](remaining)
	if (insert_index === -1) return children

	return [...remaining.slice(0, insert_index), ...to_move, ...remaining.slice(insert_index)]
}

function is_verb_phrase([head]: Constituent): boolean {
	return head.category === 'Verb Phrase'
}

function is_punctuation([head]: Constituent): boolean {
	return head.category === 'period'
		|| head.category === 'Format Marker'
		|| head.category === 'Particle' && PUNCTUATION_PARTICLE_STEMS.has(head.value)
}

const is_adverbial_clause = by_head_feature({ category: 'Clause', name: 'Type', value: 'Event Modifier (Adverbial Clause)' })

function get_clause_adposition_sense(clause: Constituent): string {
	const children = split_constituents(clause.slice(1, -1))
	const adposition = children.find(([head]) => head.category === 'Adposition')?.[0].concept
	return adposition ? `${adposition.stem}-${adposition.sense}` : ''
}

function by_head_feature({ category, name, value }: { category: SourceEntityCategory; name: FeatureName; value: FeatureValue }): ConstituentFilter {
	return ([head]) => head.category === category
		&& head.features.some(feature => feature.name === name && feature.value === value)
}
