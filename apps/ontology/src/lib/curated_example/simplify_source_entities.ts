import {
	ARGUMENT_CLAUSE_SOURCE_VALUES,
	BOUNDARY_CATEGORIES,
	CLAUSE_TYPE,
	get_source_value,
	make_boundary_end,
	make_boundary_start,
	make_participant_feature,
	make_word,
	read_source_features,
	SEMANTIC_ROLE,
	type BoundaryPartName,
	type FormatPartName,
} from './format.js'
import { parts_of_speech } from '#lib/lookups.js'
import type { CuratedExampleEncoding, CuratedExampleEntity } from '#lib/types.js'
import type { ConceptKey, EntityFeature, SourceEntity } from '@tabitha/types'

export class CuratedExampleSourceError extends Error {}

const WORD_CATEGORIES = new Set<string>(parts_of_speech)
const BOUNDARY_START_VALUES = new Set(['{', '[', '('])
const BOUNDARY_END_VALUES = new Set(['}', ']', ')'])
const CLAUSE: FormatPartName = 'Clause'
const NOUN_PHRASE: FormatPartName = 'Noun Phrase'
const ADJECTIVE_PHRASE: FormatPartName = 'Adjective Phrase'
const AGENT_ROLE = get_source_value(SEMANTIC_ROLE.values.A)

const is_start = ({ value }: SourceEntity): boolean => BOUNDARY_START_VALUES.has(value)
const is_end = ({ value }: SourceEntity): boolean => BOUNDARY_END_VALUES.has(value)
const is_clause_start = (entity: SourceEntity): boolean => entity.category === CLAUSE && is_start(entity)

const get_feature_value = ({ entity, name }: { entity: SourceEntity; name: string }): string =>
	entity.features.find(feature => feature.name === name)?.value ?? ''

/**
 * Where each entity sits: the index of the phrase or clause it is directly in, or -1 for none.
 * A closing bracket is in the boundary it closes.
 */
function find_parent_indexes(source_entities: SourceEntity[]): number[] {
	const open_indexes: number[] = []
	return source_entities.map((entity, index) => {
		const parent_index = open_indexes.at(-1) ?? -1
		if (is_start(entity)) open_indexes.push(index)
		if (is_end(entity)) open_indexes.pop()
		return parent_index
	})
}

type Structure = {
	source_entities: SourceEntity[]
	parent_indexes: number[]
}

function find_enclosing_clause_index({ structure, index }: { structure: Structure; index: number }): number {
	const parent_index = structure.parent_indexes[index]
	if (parent_index === -1) return -1
	if (is_clause_start(structure.source_entities[parent_index])) return parent_index

	return find_enclosing_clause_index({ structure, index: parent_index })
}

/** The indexes of the words in a verse that use the concept, in the order they appear. */
export function find_concept_word_indexes({ source_entities, concept }: { source_entities: SourceEntity[]; concept: ConceptKey }): number[] {
	return source_entities
		.map((entity, index) => ({ entity, index }))
		.filter(({ entity }) => entity.concept?.stem === concept.stem && entity.concept.sense === concept.sense && entity.concept.part_of_speech === concept.part_of_speech)
		.map(({ index }) => index)
}

// The clauses from the entity up to, but not including, the host clause. Undefined when the entity is not within the host clause.
function find_clause_indexes_below_host({ structure, index, host_index }: { structure: Structure; index: number; host_index: number }): number[] | undefined {
	if (index === -1) return undefined
	if (index === host_index) return []

	const clause_indexes_above = find_clause_indexes_below_host({ structure, index: structure.parent_indexes[index], host_index })
	if (!clause_indexes_above) return undefined

	return is_clause_start(structure.source_entities[index]) ? [index, ...clause_indexes_above] : clause_indexes_above
}

/**
 * The clause the word is in, along with its argument clauses and their contents.
 * Any other clause is left out, including clauses nested inside an argument clause.
 */
function find_example_indexes({ structure, host_index }: { structure: Structure; host_index: number }): number[] {
	const { source_entities } = structure

	return source_entities.flatMap((_, index) => {
		const clause_indexes = find_clause_indexes_below_host({ structure, index, host_index })
		if (!clause_indexes) return []

		const is_in_host = clause_indexes.length === 0
		const is_in_argument_clause = clause_indexes.length === 1 && ARGUMENT_CLAUSE_SOURCE_VALUES.has(get_feature_value({ entity: source_entities[clause_indexes[0]], name: CLAUSE_TYPE.name }))
		return is_in_host || is_in_argument_clause ? [index] : []
	})
}

// Participants are identified by noun list index, since the index is what links mentions of the same participant. A noun without one falls back to its concept.
function find_agent_identities({ structure, clause_index }: { structure: Structure; clause_index: number }): Set<string> {
	const { source_entities, parent_indexes } = structure

	const agent_phrase_indexes = source_entities.flatMap((entity, index) =>
		parent_indexes[index] === clause_index && entity.category === NOUN_PHRASE && get_feature_value({ entity, name: SEMANTIC_ROLE.name }) === AGENT_ROLE ? [index] : [],
	)
	const identities = source_entities
		.filter((entity, index) => entity.category === 'Noun' && agent_phrase_indexes.includes(parent_indexes[index]))
		.map(({ noun_list_index, concept }) => noun_list_index ?? (concept ? `${concept.stem}-${concept.sense}` : ''))
		.filter(identity => identity !== '')
	return new Set(identities)
}

function is_same_participant({ structure, outer_clause_index, inner_clause_index }: { structure: Structure; outer_clause_index: number; inner_clause_index: number }): boolean {
	const outer_agents = find_agent_identities({ structure, clause_index: outer_clause_index })
	const inner_agents = find_agent_identities({ structure, clause_index: inner_clause_index })

	return outer_agents.size > 0
		&& outer_agents.size === inner_agents.size
		&& [...outer_agents].every(agent => inner_agents.has(agent))
}

// The clause argument of an adjective is the same participant as the clause the adjective is in, or a different one.
function find_participant_features({ structure, index }: { structure: Structure; index: number }): EntityFeature[] {
	const parent_index = structure.parent_indexes[index]
	const is_adjective_argument_clause = is_clause_start(structure.source_entities[index]) && structure.source_entities[parent_index]?.category === ADJECTIVE_PHRASE
	if (!is_adjective_argument_clause) return []

	const outer_clause_index = find_enclosing_clause_index({ structure, index: parent_index })
	const is_same = is_same_participant({ structure, outer_clause_index, inner_clause_index: index })
	return [make_participant_feature(is_same ? 'same' : 'different')]
}

function simplify_boundary_start({ structure, index }: { structure: Structure; index: number }): CuratedExampleEntity {
	const entity = structure.source_entities[index]
	if (!BOUNDARY_CATEGORIES.has(entity.category)) throw new CuratedExampleSourceError(`A ${entity.category || 'part'} cannot be part of a curated example.`)

	const part_name = entity.category as BoundaryPartName
	const { features, feature_code } = read_source_features({ part_name, source_category: entity.category, source_features: entity.features })
	return make_boundary_start({ part_name, feature_code, features: [...features, ...find_participant_features({ structure, index })] })
}

function simplify_word({ category, concept, features }: SourceEntity): CuratedExampleEntity {
	const { features: example_features } = read_source_features({ part_name: 'Word', source_category: category, source_features: features })
	return make_word({ category, value: concept?.stem ?? '', features: example_features })
}

type SimplifyOptions = {
	source_entities: SourceEntity[]
	word_index: number
}

/**
 * Makes the entities of a curated example from a verse: the clause that the word is in, and its argument clauses.
 * What the format has no place for is left out, such as format markers and periods, words with no concept, and the clause itself.
 *
 * @param word_index the index in the verse of the word the example is for
 * @throws CuratedExampleSourceError when the word is not in a clause, or the clause holds something that cannot be part of an example
 */
export function simplify_source_entities({ source_entities, word_index }: SimplifyOptions): CuratedExampleEncoding {
	const structure = { source_entities, parent_indexes: find_parent_indexes(source_entities) }
	const host_index = find_enclosing_clause_index({ structure, index: word_index })
	if (host_index === -1) throw new CuratedExampleSourceError('The word is not in a clause.')

	const open_boundaries: CuratedExampleEntity[] = []
	return find_example_indexes({ structure, host_index }).flatMap(index => {
		const entity = source_entities[index]
		if (index === host_index) return []
		if (is_start(entity)) {
			const boundary_start = simplify_boundary_start({ structure, index })
			open_boundaries.push(boundary_start)
			return [boundary_start]
		}
		if (is_end(entity)) {
			const boundary_start = open_boundaries.pop()
			return boundary_start ? [make_boundary_end(boundary_start)] : [] // without one, it is the end of the host clause
		}
		if (WORD_CATEGORIES.has(entity.category) && entity.concept) return [simplify_word(entity)]
		return []
	})
}
