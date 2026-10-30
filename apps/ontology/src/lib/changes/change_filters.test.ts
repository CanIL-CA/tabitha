import { describe, expect, it } from 'vitest'
import { APPLIED_CHANGE_FILTERS, NO_CHANGE_FILTERS, filter_changes, parse_change_filters, parse_concept_key, to_change_filter_params, to_concept_key } from './change_filters'
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
		const filtered = filter_changes({ changes, status: 'all', since: '3.0.9501', before: 'all', action_type: 'update', concept_key: 'love|A|Verb', part_of_speech: 'Verb', affected_field: 'all' })

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

describe('filter_changes by status', () => {
	const at = new Date('2026-10-01T00:00:00.000Z')
	const changes: OntologyChange[] = [
		{ ...make_change({ id: 1 }), suggested_by: { name: 's', date: at } },
		{ ...make_change({ id: 2 }), suggested_by: { name: 's', date: at }, approved_by: { name: 'a', date: at } },
		{ ...make_change({ id: 3, version: '3.0.9501' }), suggested_by: { name: 's', date: at }, approved_by: { name: 'a', date: at }, applied_date: at },
		{ ...make_change({ id: 4, version: '3.0.9502' }), approved_by: { name: 'a', date: at }, applied_date: at },
	]
	const ids = (filtered: OntologyChange[]) => filtered.map(({ id }) => id)

	it('keeps unapproved suggestions as suggested', () => {
		expect(ids(filter_changes({ changes, ...NO_CHANGE_FILTERS, status: 'suggested' }))).toEqual([1])
	})

	it('keeps approved changes not yet applied as approved', () => {
		expect(ids(filter_changes({ changes, ...NO_CHANGE_FILTERS, status: 'approved' }))).toEqual([2])
	})

	it('keeps both suggested and approved changes as pending', () => {
		expect(ids(filter_changes({ changes, ...NO_CHANGE_FILTERS, status: 'pending' }))).toEqual([1, 2])
	})

	it('keeps applied changes as applied, whether or not they were suggested first', () => {
		expect(ids(filter_changes({ changes, ...NO_CHANGE_FILTERS, status: 'applied' }))).toEqual([3, 4])
	})
})

describe('change filters in the URL', () => {
	it('reads status, since and before, keeping the defaults for anything missing', () => {
		const search_params = new URLSearchParams({ status: 'pending', since: '3.0.9501' })

		expect(parse_change_filters({ search_params, defaults: APPLIED_CHANGE_FILTERS })).toEqual({ ...APPLIED_CHANGE_FILTERS, status: 'pending', since: '3.0.9501' })
		expect(parse_change_filters({ search_params: new URLSearchParams(), defaults: APPLIED_CHANGE_FILTERS })).toEqual(APPLIED_CHANGE_FILTERS)
	})

	it('falls back to the default status for one it does not recognise', () => {
		const search_params = new URLSearchParams({ status: 'bogus' })

		expect(parse_change_filters({ search_params, defaults: NO_CHANGE_FILTERS }).status).toBe('all')
	})

	it('writes only the URL filters that differ from the defaults', () => {
		const filters = { ...APPLIED_CHANGE_FILTERS, status: 'all', before: '3.0.9502', action_type: 'create' } as const

		expect(to_change_filter_params({ filters, defaults: APPLIED_CHANGE_FILTERS }).toString()).toBe('status=all&before=3.0.9502')
		expect(to_change_filter_params({ filters: APPLIED_CHANGE_FILTERS, defaults: APPLIED_CHANGE_FILTERS }).toString()).toBe('')
	})

	it('round-trips the filters it writes', () => {
		const filters = { ...NO_CHANGE_FILTERS, status: 'suggested', since: '3.0.9501' } as const
		const search_params = to_change_filter_params({ filters, defaults: NO_CHANGE_FILTERS })

		expect(parse_change_filters({ search_params, defaults: NO_CHANGE_FILTERS })).toEqual(filters)
	})
})
