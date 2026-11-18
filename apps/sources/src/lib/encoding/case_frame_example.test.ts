import { describe, expect, test } from 'vitest'
import { find_categories_to_add, find_deletable_unit_ids, find_example_entities, remove_unit } from './case_frame_example'
import { close_clause, close_phrase, concept, open_clause, open_phrase, structured, word } from './test_entities'
import type { CaseFrameIssue } from './validation'
import type { PageSourceEntity } from '#lib/types.js'

const GIVE = concept({ stem: 'give', part_of_speech: 'Verb' })
const TRUE = concept({ stem: 'true', part_of_speech: 'Adjective' })

const noun_phrase = ({ stem, role }: { stem: string; role?: string }): PageSourceEntity[] => [
	open_phrase({ category: 'Noun Phrase', features: role ? { 'Semantic Role': role } : {} }),
	word({ category: 'Noun', concept: concept({ stem }) }),
	close_phrase(),
]

const verb_phrase = (): PageSourceEntity[] => [open_phrase({ category: 'Verb Phrase' }), word({ category: 'Verb', concept: GIVE }), close_phrase()]

const ids = (entities: PageSourceEntity[]) => entities.map(({ id }) => id)

const find_word = ({ entities, category }: { entities: PageSourceEntity[]; category: PageSourceEntity['category'] }): PageSourceEntity =>
	entities.find(entity => entity.category === category)!

describe('find_example_entities', () => {
	test('includes the clause of the word and its argument clauses, without clauses nested inside those', () => {
		const entities = structured([
			open_clause({ Type: 'Independent' }), // 0
			...verb_phrase(), // 1-3
			...noun_phrase({ stem: 'john', role: 'Most Agent-like' }), // 4-6
			open_clause({ Type: 'Patient (Object Complement)' }), // 7
			...noun_phrase({ stem: 'book' }), // 8-10
			open_clause({ Type: 'Independent' }), close_clause(), // 11-12
			close_clause(), // 13
			close_clause(), // 14
		])
		const example_entities = find_example_entities({ source_entities: entities, word: find_word({ entities, category: 'Verb' }) })
		expect(ids(example_entities)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 14])
	})

	test('leaves out a clause that is not an argument clause, such as a relative clause in a noun phrase', () => {
		const entities = structured([
			open_clause({ Type: 'Independent' }), // 0
			...verb_phrase(), // 1-3
			open_phrase({ category: 'Noun Phrase', features: { 'Semantic Role': 'Most Agent-like' } }), // 4
			word({ category: 'Noun', concept: concept({ stem: 'man' }) }), // 5
			open_clause({ Type: 'Relative' }), ...noun_phrase({ stem: 'sin' }), close_clause(), // 6-10
			close_phrase(), // 11
			close_clause(), // 12
		])
		const example_entities = find_example_entities({ source_entities: entities, word: find_word({ entities, category: 'Verb' }) })
		expect(ids(example_entities)).toEqual([0, 1, 2, 3, 4, 5, 11, 12])
	})

	test('uses the clause the word is in when that is itself an argument clause', () => {
		const entities = structured([
			open_clause({ Type: 'Independent' }), // 0
			word({ category: 'Conjunction', concept: concept({ stem: 'and', part_of_speech: 'Conjunction' }) }), // 1
			open_clause({ Type: 'Patient (Object Complement)' }), // 2
			...verb_phrase(), // 3-5
			close_clause(), // 6
			close_clause(), // 7
		])
		const example_entities = find_example_entities({ source_entities: entities, word: find_word({ entities, category: 'Verb' }) })
		expect(ids(example_entities)).toEqual([2, 3, 4, 5, 6])
	})

	test('is empty for a word that is not in a clause', () => {
		const entities = structured(verb_phrase())
		expect(find_example_entities({ source_entities: entities, word: find_word({ entities, category: 'Verb' }) })).toEqual([])
	})
})

describe('find_deletable_unit_ids and remove_unit for a verb', () => {
	const entities = structured([
		open_clause({ Type: 'Independent' }), // 0
		...verb_phrase(), // 1-3
		...noun_phrase({ stem: 'john', role: 'Most Agent-like' }), // 4-6
		...noun_phrase({ stem: 'book', role: 'Most Patient-like' }), // 7-9
		...noun_phrase({ stem: 'bread', role: 'Most Patient-like' }), // 10-12
		open_phrase({ category: 'Adverb Phrase' }), word({ category: 'Adverb', concept: concept({ stem: 'quickly', part_of_speech: 'Adverb' }) }), close_phrase(), // 13-15
		close_clause(), // 16
	])
	const verb = find_word({ entities, category: 'Verb' })
	const example_entities = find_example_entities({ source_entities: entities, word: verb })

	test('never allows deleting the clause or the phrase holding the word', () => {
		const deletable = find_deletable_unit_ids({ example_entities, word: verb })
		expect(deletable).not.toContain(0)
		expect(deletable).not.toContain(1)
	})

	test('allows deleting units that do not supply the only instance of an argument', () => {
		expect(find_deletable_unit_ids({ example_entities, word: verb })).toEqual([7, 10, 13])
	})

	test('stops allowing the last remaining supplier of an argument to be deleted', () => {
		const without_bread = remove_unit({ example_entities, root_id: 10 })
		expect(ids(without_bread)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 14, 15, 16])
		expect(find_deletable_unit_ids({ example_entities: without_bread, word: verb })).toEqual([13])
	})

	test('leaves the entities alone when the root is not a unit', () => {
		expect(remove_unit({ example_entities, root_id: 5 })).toEqual(example_entities)
	})
})

describe('find_deletable_unit_ids for an argument clause', () => {
	test('keeps the only argument clause but allows deleting phrases inside it', () => {
		const entities = structured([
			open_clause({ Type: 'Independent' }), // 0
			...verb_phrase(), // 1-3
			...noun_phrase({ stem: 'john', role: 'Most Agent-like' }), // 4-6
			open_clause({ Type: 'Patient (Object Complement)' }), // 7
			...noun_phrase({ stem: 'book', role: 'Most Patient-like' }), // 8-10
			close_clause(), // 11
			close_clause(), // 12
		])
		const verb = find_word({ entities, category: 'Verb' })
		const example_entities = find_example_entities({ source_entities: entities, word: verb })
		expect(find_deletable_unit_ids({ example_entities, word: verb })).toEqual([8])
	})
})

describe('find_deletable_unit_ids for a usage', () => {
	test('keeps the argument that gives an adjective its usage', () => {
		const entities = structured([
			open_clause({ Type: 'Independent' }), // 0
			open_phrase({ category: 'Adjective Phrase' }), // 1
			word({ category: 'Adjective', concept: TRUE }), // 2
			...noun_phrase({ stem: 'book' }), // 3-5
			close_phrase(), // 6
			open_phrase({ category: 'Adverb Phrase' }), word({ category: 'Adverb', concept: concept({ stem: 'very', part_of_speech: 'Adverb' }) }), close_phrase(), // 7-9
			close_clause(), // 10
		])
		const adjective = find_word({ entities, category: 'Adjective' })
		const example_entities = find_example_entities({ source_entities: entities, word: adjective })
		expect(find_deletable_unit_ids({ example_entities, word: adjective })).toEqual([7])
	})
})

describe('find_deletable_unit_ids for a word directly in a clause', () => {
	const IN = concept({ stem: 'in', part_of_speech: 'Adposition' })
	const AND = concept({ stem: 'and', part_of_speech: 'Conjunction' })
	const entities = structured([
		open_clause({ Type: 'Independent' }), // 0
		word({ category: 'Adposition', concept: IN }), // 1
		word({ category: 'Conjunction', concept: AND }), // 2
		close_clause(), // 3
	])

	test('allows deleting a word without a phrase, but not the issue word', () => {
		const adposition = find_word({ entities, category: 'Adposition' })
		const example_entities = find_example_entities({ source_entities: entities, word: adposition })
		expect(find_deletable_unit_ids({ example_entities, word: adposition })).toEqual([2])
	})

	test('removes just that word', () => {
		const adposition = find_word({ entities, category: 'Adposition' })
		const example_entities = find_example_entities({ source_entities: entities, word: adposition })
		expect(ids(remove_unit({ example_entities, root_id: 2 }))).toEqual([0, 1, 3])
	})
})

describe('an attributive patient clause', () => {
	const entities = structured([
		open_clause({ Type: 'Independent' }), // 0
		...noun_phrase({ stem: 'john', role: 'Most Agent-like' }), // 1-3
		...verb_phrase(), // 4-6
		open_phrase({ category: 'Adjective Phrase', features: { Usage: 'Predicative' } }), // 7
		word({ category: 'Adjective', concept: TRUE }), // 8
		open_clause({ Type: 'Attributive Patient (Adjectival Object Complement)' }), // 9
		...noun_phrase({ stem: 'book', role: 'Most Patient-like' }), // 10-12
		open_clause({ Type: 'Independent' }), close_clause(), // 13-14
		close_clause(), // 15
		close_phrase(), // 16
		close_clause(), // 17
	])
	const adjective = find_word({ entities, category: 'Adjective' })
	const example_entities = find_example_entities({ source_entities: entities, word: adjective })

	test('is part of the example, but not the clauses nested inside it', () => {
		expect(ids(example_entities)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 16, 17])
	})

	test('cannot be deleted as the only argument of the adjective, but phrases inside it can', () => {
		const deletable = find_deletable_unit_ids({ example_entities, word: adjective })
		expect(deletable).not.toContain(9)
		expect(deletable).toContain(10)
	})
})

describe('find_categories_to_add', () => {
	const base = { check: 'case_frame', category: 'Verb', concept: GIVE } as const

	test('offers only the unexpected arguments of a mismatch', () => {
		const issue: CaseFrameIssue = { ...base, reason: 'frame_mismatch', entity_id: 2, present: ['Agent-like', 'Instrument'], current_categories: ['Agent-like', 'Patient-like'], missing_required: ['Patient-like'], unexpected: ['Instrument'] }
		expect(find_categories_to_add(issue)).toEqual(['Instrument'])
	})

	test('offers everything present when the concept has no categories', () => {
		const issue: CaseFrameIssue = { ...base, reason: 'no_categories', entity_ids: [2], present: ['Agent-like', 'Patient-like'] }
		expect(find_categories_to_add(issue)).toEqual(['Agent-like', 'Patient-like'])
	})
})
