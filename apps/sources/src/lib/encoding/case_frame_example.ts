import { is_boundary_end, is_boundary_start } from './entity_filters'
import { structure_entities } from './structured'
import { find_enclosing_clause, find_present_case_frame, get_argument_role, type CaseFrameIssue } from './validation'
import type { PageSourceEntity } from '#lib/types.js'

// The part of a verse that becomes a curated example for a word: the clause the word is in, plus its argument clauses and their contents.
// Any other clause is left out, including clauses nested inside an argument clause.

type ExampleOptions = {
	source_entities: PageSourceEntity[]
	word: PageSourceEntity
}

type ExampleEntitiesOptions = {
	example_entities: PageSourceEntity[]
	word: PageSourceEntity
}

function is_clause_start(entity: PageSourceEntity): boolean {
	return entity.category === 'Clause' && is_boundary_start(entity)
}

const ATTRIBUTIVE_PATIENT_CLAUSE = 'Attributive Patient (Adjectival Object Complement)'

function is_attributive_patient_clause(entity: PageSourceEntity): boolean {
	return entity.features.some(({ name, value }) => name === 'Type' && value === ATTRIBUTIVE_PATIENT_CLAUSE)
}

// The argument of a verb, or the attributive patient clause of an adjective.
function is_argument_clause(entity: PageSourceEntity): boolean {
	if (!is_clause_start(entity)) return false

	return get_argument_role(entity) !== undefined || is_attributive_patient_clause(entity)
}

// The clauses from the entity up to, but not including, the host clause. Undefined when the entity is not within the host clause.
function find_clauses_below_host({ source_entities, entity, host }: { source_entities: PageSourceEntity[]; entity: PageSourceEntity | undefined; host: PageSourceEntity }): PageSourceEntity[] | undefined {
	if (!entity) return undefined
	if (entity.id === host.id) return []

	const clauses_above = find_clauses_below_host({ source_entities, entity: source_entities[entity.parent_id], host })
	if (!clauses_above) return undefined

	return is_clause_start(entity) ? [entity, ...clauses_above] : clauses_above
}

export function find_example_entities({ source_entities, word }: ExampleOptions): PageSourceEntity[] {
	const host = find_enclosing_clause({ source_entities, entity: word })
	if (!host) return []

	return source_entities.filter(entity => {
		const clauses = find_clauses_below_host({ source_entities, entity, host })
		if (!clauses) return false

		const is_in_host = clauses.length === 0
		const is_in_argument_clause = clauses.length === 1 && is_argument_clause(clauses[0])
		return is_in_host || is_in_argument_clause
	})
}

const NON_WORD_CATEGORIES = new Set(['Noun Phrase', 'Verb Phrase', 'Adjective Phrase', 'Adverb Phrase', 'Clause', 'Format Marker', 'Section', 'period', ''])

// A word that is directly in a clause, not in a phrase, is a unit on its own.
function is_word_in_clause({ example_entities, entity }: { example_entities: PageSourceEntity[]; entity: PageSourceEntity }): boolean {
	if (NON_WORD_CATEGORIES.has(entity.category)) return false

	const parent = example_entities.find(({ id }) => id === entity.parent_id)
	return parent !== undefined && is_clause_start(parent)
}

function is_unit_root({ example_entities, entity }: { example_entities: PageSourceEntity[]; entity: PageSourceEntity }): boolean {
	return is_boundary_start(entity) || is_word_in_clause({ example_entities, entity })
}

// A phrase or clause from its opening bracket through its closing one, or a single word in a clause.
function find_unit({ example_entities, root }: { example_entities: PageSourceEntity[]; root: PageSourceEntity }): PageSourceEntity[] | undefined {
	if (!is_boundary_start(root)) return is_word_in_clause({ example_entities, entity: root }) ? [root] : undefined

	const start = example_entities.indexOf(root)
	const end = example_entities.findIndex(entity => is_boundary_end(entity) && entity.parent_id === root.id)
	if (start === -1 || end < start) return undefined

	return example_entities.slice(start, end + 1)
}

// The entities are renumbered, so the arguments or usages are found the same way as for a whole verse.
function find_present_key({ example_entities, word, removed_ids }: ExampleEntitiesOptions & { removed_ids: Set<number> }): string {
	const kept_entities = example_entities.filter(({ id }) => !removed_ids.has(id)).map(entity => ({ ...entity }))
	const kept_word = kept_entities.find(({ id }) => id === word.id)
	if (!kept_word) return ''

	structure_entities(kept_entities)
	return [...find_present_case_frame({ source_entities: kept_entities, word: kept_word })].sort().join('|')
}

// A unit can be deleted when it doesn't contain the word and the example still shows the same arguments or usages without it, which makes the last remaining supplier of each one undeletable.
export function find_deletable_unit_ids({ example_entities, word }: ExampleEntitiesOptions): number[] {
	const present_key = find_present_key({ example_entities, word, removed_ids: new Set() })

	return example_entities
		.filter(entity => is_unit_root({ example_entities, entity }))
		.filter(root => {
			const unit = find_unit({ example_entities, root })
			if (!unit) return false

			const removed_ids = new Set(unit.map(({ id }) => id))
			if (removed_ids.has(word.id)) return false

			return find_present_key({ example_entities, word, removed_ids }) === present_key
		})
		.map(({ id }) => id)
}

export function remove_unit({ example_entities, root_id }: { example_entities: PageSourceEntity[]; root_id: number }): PageSourceEntity[] {
	const root = example_entities.find(({ id }) => id === root_id)
	const unit = root && find_unit({ example_entities, root })
	if (!unit) return example_entities

	const removed_ids = new Set(unit.map(({ id }) => id))
	return example_entities.filter(({ id }) => !removed_ids.has(id))
}

// The arguments or usages to add to the concept's existing categories. The existing ones are all kept.
export function find_categories_to_add(issue: CaseFrameIssue): string[] {
	return issue.reason === 'no_categories' ? issue.present : issue.unexpected
}
