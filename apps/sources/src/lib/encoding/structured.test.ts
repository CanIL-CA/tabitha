import { describe, expect, it } from 'vitest'
import { structure_entities } from './structured'
import type { PageSourceEntity } from '#lib/types.js'

function make_entity({ value, category_abbr = 'C' }: {
	value: string
	category_abbr?: string
}): PageSourceEntity {
	return {
		category: 'Clause',
		category_abbr,
		value,
		feature_codes: '',
		features: [],
		concept: null,
		pairing_concept: null,
		pairing_type: null,
		noun_list_index: null,
		id: -1,
		parent_id: -1,
		boundary_category: '',
	}
}

describe('structure_entities', () => {
	it('assigns sequential ids and a -1 parent_id to entities outside any boundary', () => {
		const entities = [make_entity({ value: 'God' }), make_entity({ value: 'created' })]

		structure_entities(entities)

		expect(entities.map(e => e.id)).toEqual([0, 1])
		expect(entities.map(e => e.parent_id)).toEqual([-1, -1])
	})

	it('nests a boundary within a boundary, resolving each end to its own opener', () => {
		const entities = [
			make_entity({ value: '{', category_abbr: 'C' }), // 0: outer clause open
			make_entity({ value: '[', category_abbr: 'N' }), // 1: inner noun phrase open
			make_entity({ value: 'God' }), // 2
			make_entity({ value: ']', category_abbr: 'N' }), // 3: inner close
			make_entity({ value: '}', category_abbr: 'C' }), // 4: outer close
		]

		structure_entities(entities)

		expect(entities[1].parent_id).toBe(0) // inner open's parent is the outer open
		expect(entities[2].parent_id).toBe(1) // the word's parent is the inner open
		expect(entities[3].parent_id).toBe(1) // inner close's parent is the inner open
		expect(entities[3].boundary_category).toBe('N') // inner close inherits its opener's category
		expect(entities[4].parent_id).toBe(0) // outer close's parent is the outer open
		expect(entities[4].boundary_category).toBe('C')
	})

	it('pops back to the correct enclosing boundary for sibling pairs at the same level', () => {
		const entities = [
			make_entity({ value: '{', category_abbr: 'C' }), // 0: outer open
			make_entity({ value: '(', category_abbr: 'V' }), // 1: first sibling open
			make_entity({ value: 'said' }), // 2
			make_entity({ value: ')', category_abbr: 'V' }), // 3: first sibling close
			make_entity({ value: '(', category_abbr: 'N' }), // 4: second sibling open
			make_entity({ value: 'God' }), // 5
			make_entity({ value: ')', category_abbr: 'N' }), // 6: second sibling close
			make_entity({ value: '}', category_abbr: 'C' }), // 7: outer close
		]

		structure_entities(entities)

		expect(entities[1].parent_id).toBe(0)
		expect(entities[4].parent_id).toBe(0) // second sibling's parent is the outer open, not the first sibling
		expect(entities[6].boundary_category).toBe('N')
		expect(entities[7].boundary_category).toBe('C')
	})
})
