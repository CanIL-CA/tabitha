import { describe, expect, test } from 'vitest'
import { SelectedEntity } from './selected_entity.svelte'
import { DEFAULTS } from '#lib/edit/default_entities.js'
import type { PageSourceEntity } from '#lib/types.js'

type EntitySpec = { category: PageSourceEntity['category'], value?: string, parent_id?: number }

const make_entities = (specs: EntitySpec[]): PageSourceEntity[] =>
	specs.map((spec, id) => ({ ...DEFAULTS.EMPTY, id, ...spec }))

const selected_ids = (selection: SelectedEntity): number[] =>
	selection.all.map(entity => entity.id)

const NOUN: EntitySpec = { category: 'Noun' }
const VERB: EntitySpec = { category: 'Verb' }

describe('SelectedEntity', () => {
	test('starts with nothing selected', () => {
		const selection = new SelectedEntity(() => make_entities([NOUN]))

		expect(selection.current).toBeNull()
		expect(selection.count).toBe(0)
	})

	test('select replaces the whole selection', () => {
		const entities = make_entities([NOUN, NOUN, NOUN])
		const selection = new SelectedEntity(() => entities)

		selection.toggle(entities[0])
		selection.toggle(entities[1])
		selection.select(entities[2])

		expect(selected_ids(selection)).toEqual([2])
	})

	test('select redirects a boundary end to its boundary start', () => {
		const entities = make_entities([
			{ category: 'Clause', value: '{' },
			NOUN,
			{ category: 'Clause', value: '}', parent_id: 0 },
		])
		const selection = new SelectedEntity(() => entities)

		selection.select(entities[2])

		expect(selection.current?.id).toBe(0)
	})

	test('toggle on an empty selection selects the entity', () => {
		const entities = make_entities([NOUN, NOUN])
		const selection = new SelectedEntity(() => entities)

		selection.toggle(entities[1])

		expect(selected_ids(selection)).toEqual([1])
	})

	test('toggle appends same-category entities in click order', () => {
		const entities = make_entities([NOUN, NOUN, NOUN])
		const selection = new SelectedEntity(() => entities)

		selection.select(entities[2])
		selection.toggle(entities[0])
		selection.toggle(entities[1])

		expect(selected_ids(selection)).toEqual([2, 0, 1])
		expect(selection.current?.id).toBe(2)
		expect(selection.count).toBe(3)
	})

	test('toggle ignores an entity of a different category', () => {
		const entities = make_entities([NOUN, VERB])
		const selection = new SelectedEntity(() => entities)

		selection.select(entities[0])
		selection.toggle(entities[1])

		expect(selected_ids(selection)).toEqual([0])
	})

	test('toggle removes an already selected entity', () => {
		const entities = make_entities([NOUN, NOUN, NOUN])
		const selection = new SelectedEntity(() => entities)

		selection.select(entities[0])
		selection.toggle(entities[1])
		selection.toggle(entities[2])
		selection.toggle(entities[1])

		expect(selected_ids(selection)).toEqual([0, 2])
	})

	test('toggling off the primary promotes the next selected entity', () => {
		const entities = make_entities([NOUN, NOUN, NOUN])
		const selection = new SelectedEntity(() => entities)

		selection.select(entities[0])
		selection.toggle(entities[2])
		selection.toggle(entities[0])

		expect(selection.current?.id).toBe(2)
		expect(selection.count).toBe(1)
	})

	test('toggling off the only selected entity clears the selection', () => {
		const entities = make_entities([NOUN])
		const selection = new SelectedEntity(() => entities)

		selection.select(entities[0])
		selection.toggle(entities[0])

		expect(selection.current).toBeNull()
	})

	test('toggle on a boundary falls back to a plain select', () => {
		const entities = make_entities([
			NOUN,
			{ category: 'Clause', value: '{' },
			{ category: 'Clause', value: '}', parent_id: 1 },
		])
		const selection = new SelectedEntity(() => entities)

		selection.select(entities[0])
		selection.toggle(entities[2])

		expect(selected_ids(selection)).toEqual([1])
	})

	test('toggle with a boundary as the primary falls back to a plain select', () => {
		const entities = make_entities([{ category: 'Clause', value: '{' }, NOUN])
		const selection = new SelectedEntity(() => entities)

		selection.select(entities[0])
		selection.toggle(entities[1])

		expect(selected_ids(selection)).toEqual([1])
	})

	test('is_selected reports membership', () => {
		const entities = make_entities([NOUN, NOUN, NOUN])
		const selection = new SelectedEntity(() => entities)

		selection.select(entities[0])
		selection.toggle(entities[1])

		expect(selection.is_selected(entities[0])).toBe(true)
		expect(selection.is_selected(entities[1])).toBe(true)
		expect(selection.is_selected(entities[2])).toBe(false)
	})

	test('ids that no longer exist after the entities change are dropped', () => {
		let entities = make_entities([NOUN, NOUN, NOUN])
		const selection = new SelectedEntity(() => entities)

		selection.select(entities[0])
		selection.toggle(entities[2])
		entities = entities.slice(0, 2)

		expect(selected_ids(selection)).toEqual([0])
	})

	test('clear empties the selection', () => {
		const entities = make_entities([NOUN, NOUN])
		const selection = new SelectedEntity(() => entities)

		selection.select(entities[0])
		selection.toggle(entities[1])
		selection.clear()

		expect(selection.count).toBe(0)
	})
})
