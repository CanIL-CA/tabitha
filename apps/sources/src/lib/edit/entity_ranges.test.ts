import { describe, expect, test } from 'vitest'
import { structure_entities } from '#lib/encoding/structured.js'
import { DEFAULTS } from './default_entities'
import {
	get_action_range,
	get_enclosing_range,
	get_hover_range,
	get_insert_slot_range,
	is_hover_target_in_range,
	is_slot_in_range,
} from './entity_ranges'

// 0 1 2 3 4 5 6 7
// ¶ { [ a ] b } .
const build_entities = () => {
	const entities = ['¶', '{', '[', 'a', ']', 'b', '}', '.'].map(value => ({ ...DEFAULTS.EMPTY, value }))
	structure_entities(entities)
	return entities
}
const entities = build_entities()

describe('get_action_range', () => {
	test.each([
		{ id: 1, expected: [1, 6], description: 'a boundary start spans its whole boundary' },
		{ id: 4, expected: [2, 4], description: 'a boundary end spans its whole boundary' },
		{ id: 3, expected: [3, 3], description: 'a nested entity spans only itself' },
		{ id: 0, expected: [0, 0], description: 'a top-level entity spans only itself' },
		{ id: 99, expected: null, description: 'a missing entity has no range' },
	])('$description', ({ id, expected }) => {
		expect(get_action_range({ entities, id })).toEqual(expected)
	})
})

describe('get_enclosing_range', () => {
	test.each([
		{ id: 2, expected: [2, 4], description: 'a boundary start spans its own boundary' },
		{ id: 6, expected: [1, 6], description: 'a boundary end spans its own boundary' },
		{ id: 3, expected: [2, 4], description: 'a nested entity spans the boundary it sits in' },
		{ id: 5, expected: [1, 6], description: 'a sibling of a nested boundary spans its parent' },
		{ id: 7, expected: [7, 7], description: 'a top-level entity spans only itself' },
		{ id: 99, expected: null, description: 'a missing entity has no range' },
	])('$description', ({ id, expected }) => {
		expect(get_enclosing_range({ entities, id })).toEqual(expected)
	})
})

describe('get_insert_slot_range', () => {
	test.each([
		{ slot: 3, expected: [2, 4], description: 'a slot inside a boundary spans that boundary' },
		{ slot: 2, expected: [1, 6], description: 'a slot before a nested boundary spans its parent' },
		{ slot: 1, expected: null, description: 'a top-level slot has no range' },
		{ slot: entities.length, expected: null, description: 'the final slot has no range' },
	])('$description', ({ slot, expected }) => {
		expect(get_insert_slot_range({ entities, slot })).toEqual(expected)
	})
})

describe('get_hover_range', () => {
	test('an entity highlights the boundary it sits in', () => {
		expect(get_hover_range({ entities, target: { kind: 'entity', id: 3 } })).toEqual([2, 4])
	})

	test('an insert slot highlights the boundary it inserts into', () => {
		expect(get_hover_range({ entities, target: { kind: 'insert_slot', slot: 5 } })).toEqual([1, 6])
	})
})

describe('is_slot_in_range', () => {
	const range = [3, 6] as const

	test.each([3, 7])('slot %i on either end of the range is outside it', slot => {
		// Dropping in these spots is effectively a no-op, but we still want to highlight them to the user
		expect(is_slot_in_range({ slot, range })).toBe(false)
	})

	test.each([4, 5, 6])('slot %i inside the range is in it', slot => {
		expect(is_slot_in_range({ slot, range })).toBe(true)
	})

	test.each([0, 2, 8, 10])('slot %i away from the range is outside it', slot => {
		expect(is_slot_in_range({ slot, range })).toBe(false)
	})

	test('nothing is in a missing range', () => {
		expect(is_slot_in_range({ slot: 4, range: null })).toBe(false)
	})
})

describe('is_hover_target_in_range', () => {
	const range = [3, 6] as const

	test('an entity at the start of the range is in it', () => {
		expect(is_hover_target_in_range({ target: { kind: 'entity', id: 3 }, range })).toBe(true)
	})

	test('the slot at the start of the range is outside it', () => {
		expect(is_hover_target_in_range({ target: { kind: 'insert_slot', slot: 3 }, range })).toBe(false)
	})
})
