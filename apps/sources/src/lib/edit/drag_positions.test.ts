import { describe, expect, test } from 'vitest'
import {
	get_auto_scroll_speed,
	get_insert_position,
	get_slot_beside_entity,
	is_no_op_slot,
	summarize_dragged_range,
} from './drag_positions'

describe('is_no_op_slot', () => {
	const dragged_range = { drag_index: 3, range_length: 4 }

	test.each([3, 7])('slot %i on either end of the dragged range is NOT a no-op', slot => {
		// While dropping in these spots is effectively a no-op, we still want to highlight these slots to the user
		expect(is_no_op_slot({ ...dragged_range, slot })).toBe(false)
	})

	test.each([4, 5, 6])('slot %i inside the dragged range is a no-op', slot => {
		expect(is_no_op_slot({ ...dragged_range, slot })).toBe(true)
	})

	test.each([0, 2, 8, 10])('slot %i outside the dragged range moves entities', slot => {
		expect(is_no_op_slot({ ...dragged_range, slot })).toBe(false)
	})
})

describe('get_insert_position', () => {
	test('a slot before the dragged range keeps its index', () => {
		expect(get_insert_position({ drag_index: 5, range_length: 3, slot: 2 })).toBe(2)
	})

	test('a slot after the dragged range shifts back by the range length', () => {
		expect(get_insert_position({ drag_index: 1, range_length: 3, slot: 6 })).toBe(3)
	})
})

describe('get_slot_beside_entity', () => {
	const entity = { index: 4, left: 100, width: 40 }

	test('left half drops before the entity', () => {
		expect(get_slot_beside_entity({ ...entity, pointer_x: 110 })).toBe(4)
	})

	test('right half drops after the entity', () => {
		expect(get_slot_beside_entity({ ...entity, pointer_x: 130 })).toBe(5)
	})
})

describe('get_auto_scroll_speed', () => {
	const bounds = { top: 0, bottom: 800 }

	test('does not scroll away from the edges', () => {
		expect(get_auto_scroll_speed({ ...bounds, pointer_y: 400 })).toBe(0)
	})

	test('scrolls up near the top edge, fastest at the edge', () => {
		const near_edge = get_auto_scroll_speed({ ...bounds, pointer_y: 40 })
		const at_edge = get_auto_scroll_speed({ ...bounds, pointer_y: 0 })

		expect(near_edge).toBeLessThan(0)
		expect(at_edge).toBeLessThan(near_edge)
	})

	test('scrolls down near the bottom edge', () => {
		expect(get_auto_scroll_speed({ ...bounds, pointer_y: 790 })).toBeGreaterThan(0)
	})
})

describe('summarize_dragged_range', () => {
	test('a single entity is shown alone', () => {
		expect(summarize_dragged_range({ entities: ['a'] })).toEqual({ shown_entities: ['a'], hidden_count: 0 })
	})

	test('a boundary shows its label and first child, counting the rest except the closing bracket', () => {
		const boundary = ['[NP', 'a', 'b', 'c', ']']

		expect(summarize_dragged_range({ entities: boundary })).toEqual({
			shown_entities: ['[NP', 'a'],
			hidden_count: 2,
			closing_entity: ']',
		})
	})

	test('a boundary with one child has nothing hidden to count', () => {
		expect(summarize_dragged_range({ entities: ['[NP', 'a', ']'] }).hidden_count).toBe(0)
	})
})
