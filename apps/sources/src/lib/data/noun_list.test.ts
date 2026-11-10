import { describe, expect, test } from 'vitest'
import { build_noun_list_rows } from './noun_list'
import { DEFAULTS } from '#lib/edit/default_entities.js'
import type { ConceptKey } from '@tabitha/types'
import type { PageSourceEntity } from '#lib/types.js'

const make_entity = ({ id, concept, pairing_concept = null, noun_list_index }: {
	id: number
	concept: ConceptKey | null
	pairing_concept?: ConceptKey | null
	noun_list_index: string | null
}): PageSourceEntity => ({
	...DEFAULTS.EMPTY,
	id,
	category: 'Noun',
	concept,
	pairing_concept,
	pairing_type: pairing_concept ? 'simple-complex' : null,
	noun_list_index,
})

const TREE: ConceptKey = { stem: 'tree', sense: 'A', part_of_speech: 'Noun' }
const ROCK: ConceptKey = { stem: 'rock', sense: 'B', part_of_speech: 'Noun' }
const RIVER: ConceptKey = { stem: 'river', sense: 'A', part_of_speech: 'Noun' }

describe('build_noun_list_rows', () => {
	test('is empty when no entity has a noun list index', () => {
		const rows = build_noun_list_rows({
			source_entities: [make_entity({ id: 0, concept: TREE, noun_list_index: null })],
		})
		expect(rows).toEqual([])
	})

	test('collects the ids of the entities using each index', () => {
		const rows = build_noun_list_rows({
			source_entities: [
				make_entity({ id: 3, concept: TREE, noun_list_index: '1' }),
				make_entity({ id: 5, concept: RIVER, noun_list_index: '2' }),
				make_entity({ id: 8, concept: TREE, noun_list_index: '1' }),
			],
		})
		expect(rows).toEqual([
			{ index: '1', noun: 'tree-A', entity_ids: [3, 8] },
			{ index: '2', noun: 'river-A', entity_ids: [5] },
		])
	})

	test('appends a differing noun to the row instead of repeating a matching one', () => {
		const rows = build_noun_list_rows({
			source_entities: [
				make_entity({ id: 0, concept: TREE, noun_list_index: '1' }),
				make_entity({ id: 1, concept: ROCK, noun_list_index: '1' }),
				make_entity({ id: 2, concept: ROCK, noun_list_index: '1' }),
			],
		})
		expect(rows).toEqual([{ index: '1', noun: 'tree-A, rock-B', entity_ids: [0, 1, 2] }])
	})

	test('includes the pairing concept in the noun', () => {
		const rows = build_noun_list_rows({
			source_entities: [make_entity({ id: 0, concept: TREE, pairing_concept: ROCK, noun_list_index: '1' })],
		})
		expect(rows[0].noun).toBe('tree-A/rock-B')
	})

	test('adds an empty gap row for each unused index below the highest one in use', () => {
		const rows = build_noun_list_rows({
			source_entities: [
				make_entity({ id: 0, concept: TREE, noun_list_index: '1' }),
				make_entity({ id: 1, concept: RIVER, noun_list_index: '4' }),
			],
		})
		expect(rows).toEqual([
			{ index: '1', noun: 'tree-A', entity_ids: [0] },
			{ index: '2', noun: '', entity_ids: [] },
			{ index: '3', noun: '', entity_ids: [] },
			{ index: '4', noun: 'river-A', entity_ids: [1] },
		])
	})

	test('orders rows by index regardless of entity order, with letters after the digits', () => {
		const rows = build_noun_list_rows({
			source_entities: [
				make_entity({ id: 0, concept: TREE, noun_list_index: 'A' }),
				make_entity({ id: 1, concept: RIVER, noun_list_index: '9' }),
			],
		})
		expect(rows.map(({ index }) => index)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', 'A'])
	})

	test('ignores entities without a noun list index or a concept', () => {
		const rows = build_noun_list_rows({
			source_entities: [
				make_entity({ id: 0, concept: TREE, noun_list_index: null }),
				make_entity({ id: 1, concept: null, noun_list_index: '1' }),
			],
		})
		expect(rows).toEqual([])
	})
})
