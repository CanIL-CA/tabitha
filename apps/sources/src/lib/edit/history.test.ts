import { describe, expect, test } from 'vitest'
import { EditHistory, type EditState } from './history.svelte'
import { DEFAULTS } from './default_entities'

const make_state = (values: string[]): EditState => ({
	source_entities: values.map((value, id) => ({ ...DEFAULTS.EMPTY, id, value })),
	noun_list: [],
})

const entity_values = (history: EditHistory): string[] =>
	history.current.source_entities.map(entity => entity.value)

const count_available_undos = (history: EditHistory): number => {
	let undo_count = 0
	while (history.can_undo) {
		history.undo()
		undo_count++
	}
	return undo_count
}

describe('EditHistory', () => {
	test('starts with nothing to undo or redo', () => {
		const history = new EditHistory(make_state(['a', 'b']))

		expect(history.can_undo).toBe(false)
		expect(history.can_redo).toBe(false)
		expect(entity_values(history)).toEqual(['a', 'b'])
	})

	test('undo restores the state captured by record', () => {
		const history = new EditHistory(make_state(['a', 'b']))

		history.record()
		history.current.source_entities.splice(0, 1)
		expect(history.can_undo).toBe(true)

		history.undo()
		expect(entity_values(history)).toEqual(['a', 'b'])
		expect(history.can_undo).toBe(false)
	})

	test('redo reapplies an undone edit', () => {
		const history = new EditHistory(make_state(['a', 'b']))

		history.record()
		history.current.source_entities.push({ ...DEFAULTS.EMPTY, id: 2, value: 'c' })
		history.undo()
		expect(history.can_redo).toBe(true)

		history.redo()
		expect(entity_values(history)).toEqual(['a', 'b', 'c'])
		expect(history.can_redo).toBe(false)
		expect(history.can_undo).toBe(true)
	})

	test('walks back and forward through several edits in order', () => {
		const history = new EditHistory(make_state(['a']))

		history.record()
		history.current.source_entities.push({ ...DEFAULTS.EMPTY, id: 1, value: 'b' })
		history.record()
		history.current.source_entities.push({ ...DEFAULTS.EMPTY, id: 2, value: 'c' })

		history.undo()
		expect(entity_values(history)).toEqual(['a', 'b'])
		history.undo()
		expect(entity_values(history)).toEqual(['a'])
		history.redo()
		expect(entity_values(history)).toEqual(['a', 'b'])
		history.redo()
		expect(entity_values(history)).toEqual(['a', 'b', 'c'])
	})

	test('a new edit after undo discards the redo branch', () => {
		const history = new EditHistory(make_state(['a']))

		history.record()
		history.current.source_entities[0].value = 'b'
		history.undo()
		expect(history.can_redo).toBe(true)

		history.record()
		history.current.source_entities[0].value = 'z'
		expect(history.can_redo).toBe(false)
	})

	test('recorded states are detached from later nested mutations', () => {
		const initial_state = make_state(['a'])
		initial_state.source_entities[0].features = [{ name: 'Type', value: 'Independent' }]
		const history = new EditHistory(initial_state)

		history.record()
		history.current.source_entities[0].features[0].value = 'Dependent'
		history.undo()

		expect(history.current.source_entities[0].features[0].value).toBe('Independent')
	})

	test('undo and redo restore noun_list along with source_entities', () => {
		const history = new EditHistory(make_state(['a']))

		history.record()
		history.current.noun_list.push({ index: '1', noun: 'God-A' })
		history.undo()
		expect(history.current.noun_list).toEqual([])

		history.redo()
		expect(history.current.noun_list).toEqual([{ index: '1', noun: 'God-A' }])
	})

	test('undo and redo do nothing when their stack is empty', () => {
		const history = new EditHistory(make_state(['a']))

		history.undo()
		history.redo()

		expect(entity_values(history)).toEqual(['a'])
		expect(history.can_undo).toBe(false)
		expect(history.can_redo).toBe(false)
	})

	test('keeps only the most recent 20 undo steps', () => {
		const history = new EditHistory(make_state(['0']))

		for (let edit = 1; edit <= 25; edit++) {
			history.record()
			history.current.source_entities[0].value = String(edit)
		}

		expect(count_available_undos(history)).toBe(20)
		expect(entity_values(history)).toEqual(['5'])
	})
})
