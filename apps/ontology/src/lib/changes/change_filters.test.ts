import { describe, expect, it } from 'vitest'
import { NO_CHANGE_FILTERS, filter_changes, parse_concept_key, to_concept_key } from './change_filters'
import type { OntologyChange } from '#lib/types.js'

function make_change({ id, stem = 'love', sense = 'A', part_of_speech = 'Verb', action = 'update', version = null, data = {} }: {
	readonly id: number
	readonly stem?: string
	readonly sense?: string
	readonly part_of_speech?: 'Verb' | 'Noun'
	readonly action?: OntologyChange['action']
	readonly version?: string | null
	readonly data?: OntologyChange['data']
}): OntologyChange {
	return {
		id,
		concept: { stem, sense, part_of_speech },
		data,
		action,
		suggested_by: null,
		approved_by: null,
		applied_date: null,
		version,
	}
}

describe('concept keys', () => {
	it('round-trips a concept through its key', () => {
		const change = make_change({ id: 1, stem: 'give-up', sense: 'B', part_of_speech: 'Noun' })

		expect(to_concept_key(change)).toBe('give-up|B|Noun')
		expect(parse_concept_key('give-up|B|Noun')).toEqual(change.concept)
	})
})

describe('filter_changes', () => {
	const changes = [
		make_change({ id: 1, action: 'create', version: '3.0.9501' }),
		make_change({ id: 2, action: 'update', version: '3.0.9502' }),
		make_change({ id: 3, stem: 'faith', part_of_speech: 'Noun', action: 'update', version: '3.0.9503' }),
		make_change({ id: 4, action: 'update' }),
	]
	const ids = (filtered: OntologyChange[]) => filtered.map(({ id }) => id)

	it('keeps every change when no filter is set', () => {
		expect(ids(filter_changes({ changes, ...NO_CHANGE_FILTERS }))).toEqual([1, 2, 3, 4])
	})

	it('filters by action', () => {
		expect(ids(filter_changes({ changes, ...NO_CHANGE_FILTERS, action_type: 'create' }))).toEqual([1])
	})

	it('filters by concept, matching the stem, sense and part of speech together', () => {
		expect(ids(filter_changes({ changes, ...NO_CHANGE_FILTERS, concept_key: 'faith|A|Noun' }))).toEqual([3])
		expect(ids(filter_changes({ changes, ...NO_CHANGE_FILTERS, concept_key: 'faith|A|Verb' }))).toEqual([])
	})

	it('filters by version, leaving out changes that have no version yet', () => {
		expect(ids(filter_changes({ changes, ...NO_CHANGE_FILTERS, since: '3.0.9501' }))).toEqual([2, 3])
		expect(ids(filter_changes({ changes, ...NO_CHANGE_FILTERS, before: '3.0.9502' }))).toEqual([1, 2])
	})

	it('filters by part of speech', () => {
		expect(ids(filter_changes({ changes, ...NO_CHANGE_FILTERS, part_of_speech: 'Noun' }))).toEqual([3])
		expect(ids(filter_changes({ changes, ...NO_CHANGE_FILTERS, part_of_speech: 'Verb' }))).toEqual([1, 2, 4])
		expect(ids(filter_changes({ changes, ...NO_CHANGE_FILTERS, part_of_speech: 'Adverb' }))).toEqual([])
	})

	it('applies every filter at once', () => {
		const filtered = filter_changes({ changes, since: '3.0.9501', before: 'all', action_type: 'update', concept_key: 'love|A|Verb', part_of_speech: 'Verb', affected_field: 'all' })

		expect(ids(filtered)).toEqual([2])
	})
})

describe('filter_changes by affected field', () => {
	const changes = [
		make_change({ id: 1, action: 'update', data: { level: { old: '1', value: '2' } } }),
		make_change({ id: 2, action: 'update', data: { gloss: { old: 'a', value: 'b' }, categories: { old: [''], value: ['Agent-like'] } } }),
		make_change({ id: 3, action: 'create', data: { level: { value: '1' }, gloss: { value: 'c' } } }),
		make_change({ id: 4, action: 'update', data: {} }),
	]
	const ids = (filtered: OntologyChange[]) => filtered.map(({ id }) => id)

	it('keeps changes that affected the field, even when they affected other fields too', () => {
		expect(ids(filter_changes({ changes, ...NO_CHANGE_FILTERS, affected_field: 'level' }))).toEqual([1, 3])
		expect(ids(filter_changes({ changes, ...NO_CHANGE_FILTERS, affected_field: 'gloss' }))).toEqual([2, 3])
		expect(ids(filter_changes({ changes, ...NO_CHANGE_FILTERS, affected_field: 'categories' }))).toEqual([2])
	})

	it('shows only edits when combined with the Action filter', () => {
		expect(ids(filter_changes({ changes, ...NO_CHANGE_FILTERS, action_type: 'update', affected_field: 'level' }))).toEqual([1])
	})

	it('finds nothing for a field no edit touched', () => {
		expect(ids(filter_changes({ changes, ...NO_CHANGE_FILTERS, affected_field: 'curated_examples' }))).toEqual([])
	})
})
