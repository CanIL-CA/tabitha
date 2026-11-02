import { describe, expect, test } from 'vitest'
import { EditHistory, type EditState } from './history.svelte'
import { DEFAULTS } from './default_entities'

const make_state = (values: string[]): EditState => ({
	source_entities: values.map((value, id) => ({ ...DEFAULTS.EMPTY, id, value })),
})

const NO_IDS = { ids_before: [], ids_after: [] }

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

		history.record(NO_IDS)
		history.current.source_entities.splice(0, 1)
		expect(history.can_undo).toBe(true)

		history.undo()
		expect(entity_values(history)).toEqual(['a', 'b'])
		expect(history.can_undo).toBe(false)
	})

	test('redo reapplies an undone edit', () => {
		const history = new EditHistory(make_state(['a', 'b']))

		history.record(NO_IDS)
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

		history.record(NO_IDS)
		history.current.source_entities.push({ ...DEFAULTS.EMPTY, id: 1, value: 'b' })
		history.record(NO_IDS)
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

		history.record(NO_IDS)
		history.current.source_entities[0].value = 'b'
		history.undo()
		expect(history.can_redo).toBe(true)

		history.record(NO_IDS)
		history.current.source_entities[0].value = 'z'
		expect(history.can_redo).toBe(false)
	})

	test('recorded states are detached from later nested mutations', () => {
		const initial_state = make_state(['a'])
		initial_state.source_entities[0].features = [{ name: 'Type', value: 'Independent' }]
		const history = new EditHistory(initial_state)

		history.record(NO_IDS)
		history.current.source_entities[0].features[0].value = 'Dependent'
		history.undo()

		expect(history.current.source_entities[0].features[0].value).toBe('Independent')
	})


	test('noun_list_rows follows edits, undo and redo', () => {
		const history = new EditHistory(make_state(['a']))
		expect(history.noun_list_rows).toEqual([])

		history.record(NO_IDS)
		history.current.source_entities[0].concept = { stem: 'God', sense: 'A', part_of_speech: 'Noun' }
		history.current.source_entities[0].noun_list_index = '2'
		expect(history.noun_list_rows.map(({ index, noun }) => [index, noun])).toEqual([['1', ''], ['2', 'God-A']])

		history.undo()
		expect(history.noun_list_rows).toEqual([])

		history.redo()
		expect(history.noun_list_rows).toHaveLength(2)
	})
	test('undo and redo do nothing when their stack is empty', () => {
		const history = new EditHistory(make_state(['a']))

		history.undo()
		history.redo()

		expect(entity_values(history)).toEqual(['a'])
		expect(history.can_undo).toBe(false)
		expect(history.can_redo).toBe(false)
	})

	test('undo returns ids_before and redo returns ids_after', () => {
		const history = new EditHistory(make_state(['a', 'b', 'c']))

		history.record({ ids_before: [0], ids_after: [2] })
		history.current.source_entities.push({ ...DEFAULTS.EMPTY, id: 3, value: 'd' })

		expect(history.undo()).toEqual([0])
		expect(history.redo()).toEqual([2])
	})

	test('ids_after defaults to ids_before', () => {
		const history = new EditHistory(make_state(['a']))

		history.record({ ids_before: [1] })
		history.current.source_entities[0].value = 'b'

		expect(history.undo()).toEqual([1])
		expect(history.redo()).toEqual([1])
	})

	test('each entry keeps its own ids as undo and redo walk through several edits', () => {
		const history = new EditHistory(make_state(['a']))

		history.record({ ids_before: [1], ids_after: [2] })
		history.current.source_entities[0].value = 'b'
		history.record({ ids_before: [3], ids_after: [4] })
		history.current.source_entities[0].value = 'c'

		expect(history.undo()).toEqual([3])
		expect(history.undo()).toEqual([1])
		expect(history.redo()).toEqual([2])
		expect(history.redo()).toEqual([4])
		expect(history.undo()).toEqual([3])
	})

	test('undo and redo return no ids when their stack is empty', () => {
		const history = new EditHistory(make_state(['a']))

		expect(history.undo()).toEqual([])
		expect(history.redo()).toEqual([])
	})

	test('keeps only the most recent 20 undo steps', () => {
		const history = new EditHistory(make_state(['0']))

		for (let edit = 1; edit <= 25; edit++) {
			history.record(NO_IDS)
			history.current.source_entities[0].value = String(edit)
		}

		expect(count_available_undos(history)).toBe(20)
		expect(entity_values(history)).toEqual(['5'])
	})
})
