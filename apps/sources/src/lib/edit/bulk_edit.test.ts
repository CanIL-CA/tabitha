import { describe, expect, test } from 'vitest'
import {
	apply_concept,
	apply_feature_value,
	apply_noun_list_index,
	apply_pairing,
	apply_sense,
	do_concepts_differ,
	do_feature_values_differ,
	do_noun_list_indexes_differ,
	do_pairings_differ,
	do_stems_differ,
} from './bulk_edit'
import { DEFAULTS } from './default_entities'
import type { ConceptKey } from '@tabitha/types'
import type { FeatureMap, PageSourceEntity } from '#lib/types.js'

const make_noun = ({ id, features }: { id: number, features: Record<string, string> }): PageSourceEntity => ({
	...DEFAULTS.EMPTY,
	id,
	category: 'Noun',
	features: Object.entries(features).map(([name, value]) => ({ name, value })),
})

const NOUN_FEATURE_MAP: FeatureMap = new Map([
	['Noun', [
		{ name: 'Number', values: [{ code: 's', value: 'Singular' }, { code: 'p', value: 'Plural' }, { code: 'd', value: 'Dual' }] },
		{ name: 'Person', values: [{ code: '.', value: 'Not Applicable' }, { code: 't', value: 'Third' }] },
	]],
])

const feature_value = ({ entity, name }: { entity: PageSourceEntity, name: string }) =>
	entity.features.find(feature => feature.name === name)?.value

describe('apply_feature_value', () => {
	test('sets the feature on every entity', () => {
		const entities = [
			make_noun({ id: 0, features: { Number: 'Singular', Person: 'Third' } }),
			make_noun({ id: 1, features: { Number: 'Plural', Person: 'Third' } }),
		]

		apply_feature_value({ entities, feature_name: 'Number', value: 'Dual', feature_map: NOUN_FEATURE_MAP })

		expect(entities.map(entity => feature_value({ entity, name: 'Number' }))).toEqual(['Dual', 'Dual'])
	})

	test('leaves the other features alone', () => {
		const entities = [make_noun({ id: 0, features: { Number: 'Singular', Person: 'Third' } })]

		apply_feature_value({ entities, feature_name: 'Number', value: 'Dual', feature_map: NOUN_FEATURE_MAP })

		expect(feature_value({ entity: entities[0], name: 'Person' })).toBe('Third')
	})

	test('skips an entity that lacks the feature', () => {
		const entities = [
			make_noun({ id: 0, features: { Number: 'Singular' } }),
			make_noun({ id: 1, features: { Person: 'Third' } }),
		]

		apply_feature_value({ entities, feature_name: 'Number', value: 'Dual', feature_map: NOUN_FEATURE_MAP })

		expect(entities[1].features).toEqual([{ name: 'Person', value: 'Third' }])
	})
})

describe('apply_feature_value feature codes', () => {
	test('recomputes feature_codes from the updated features', () => {
		const entities = [
			make_noun({ id: 0, features: { Number: 'Singular', Person: 'Third' } }),
			make_noun({ id: 1, features: { Number: 'Plural', Person: 'Third' } }),
		]

		apply_feature_value({ entities, feature_name: 'Number', value: 'Dual', feature_map: NOUN_FEATURE_MAP })

		expect(entities.map(({ feature_codes }) => feature_codes)).toEqual(['dt', 'dt'])
	})

	test('leaves feature_codes alone for an entity that lacks the feature', () => {
		const entities = [make_noun({ id: 0, features: { Person: 'Third' } })]
		entities[0].feature_codes = 'x'

		apply_feature_value({ entities, feature_name: 'Number', value: 'Dual', feature_map: NOUN_FEATURE_MAP })

		expect(entities[0].feature_codes).toBe('x')
	})
})

describe('do_feature_values_differ', () => {
	test('is false when every entity has the same value', () => {
		const entities = [
			make_noun({ id: 0, features: { Number: 'Singular' } }),
			make_noun({ id: 1, features: { Number: 'Singular' } }),
		]

		expect(do_feature_values_differ({ entities, feature_name: 'Number' })).toBe(false)
	})

	test('is true when any entity has a different value', () => {
		const entities = [
			make_noun({ id: 0, features: { Number: 'Singular' } }),
			make_noun({ id: 1, features: { Number: 'Singular' } }),
			make_noun({ id: 2, features: { Number: 'Plural' } }),
		]

		expect(do_feature_values_differ({ entities, feature_name: 'Number' })).toBe(true)
	})

	test('is false for a single entity', () => {
		const entities = [make_noun({ id: 0, features: { Number: 'Singular' } })]

		expect(do_feature_values_differ({ entities, feature_name: 'Number' })).toBe(false)
	})
})

const make_concept = ({ stem, sense = 'A' }: { stem: string, sense?: string }): ConceptKey => ({
	stem,
	sense,
	part_of_speech: 'Noun',
})

describe('apply_concept', () => {
	test('gives every entity the concept', () => {
		const entities = [make_noun({ id: 0, features: {} }), make_noun({ id: 1, features: {} })]

		apply_concept({ entities, concept: make_concept({ stem: 'love', sense: 'B' }) })

		expect(entities.map(({ concept }) => concept)).toEqual([
			make_concept({ stem: 'love', sense: 'B' }),
			make_concept({ stem: 'love', sense: 'B' }),
		])
	})

	test('gives each entity its own copy', () => {
		const entities = [make_noun({ id: 0, features: {} }), make_noun({ id: 1, features: {} })]

		apply_concept({ entities, concept: make_concept({ stem: 'love' }) })
		entities[0].concept!.sense = 'Z'

		expect(entities[1].concept!.sense).toBe('A')
	})
})

describe('do_concepts_differ', () => {
	test('is false when every concept is the same', () => {
		const concepts = [make_concept({ stem: 'love' }), make_concept({ stem: 'love' })]

		expect(do_concepts_differ({ concepts })).toBe(false)
	})

	test('is true when only the sense differs', () => {
		const concepts = [make_concept({ stem: 'love', sense: 'A' }), make_concept({ stem: 'love', sense: 'B' })]

		expect(do_concepts_differ({ concepts })).toBe(true)
	})

	test('is false for a single concept and for none', () => {
		expect(do_concepts_differ({ concepts: [make_concept({ stem: 'love' })] })).toBe(false)
		expect(do_concepts_differ({ concepts: [] })).toBe(false)
	})
})

describe('do_stems_differ', () => {
	test('ignores differing senses of the same stem', () => {
		const concepts = [make_concept({ stem: 'love', sense: 'A' }), make_concept({ stem: 'love', sense: 'B' })]

		expect(do_stems_differ({ concepts })).toBe(false)
	})

	test('is true when any stem differs', () => {
		const concepts = [make_concept({ stem: 'love' }), make_concept({ stem: 'love' }), make_concept({ stem: 'hate' })]

		expect(do_stems_differ({ concepts })).toBe(true)
	})
})

describe('apply_sense', () => {
	test('sets the sense on every concept and leaves the stem alone', () => {
		const concepts = [make_concept({ stem: 'love', sense: 'A' }), make_concept({ stem: 'love', sense: 'B' })]

		apply_sense({ concepts, sense: 'C' })

		expect(concepts).toEqual([
			make_concept({ stem: 'love', sense: 'C' }),
			make_concept({ stem: 'love', sense: 'C' }),
		])
	})
})

const make_entity = (overrides: Partial<PageSourceEntity> & { id: number }): PageSourceEntity => ({
	...DEFAULTS.EMPTY,
	category: 'Noun',
	...overrides,
})

describe('apply_pairing', () => {
	test('gives every entity its own copy of the pairing', () => {
		const entities = [make_entity({ id: 0 }), make_entity({ id: 1 })]

		apply_pairing({ entities, pairing_concept: make_concept({ stem: 'water' }), pairing_type: 'simple-complex' })
		entities[0].pairing_concept!.sense = 'Z'

		expect(entities[1].pairing_concept).toEqual(make_concept({ stem: 'water' }))
		expect(entities.map(({ pairing_type }) => pairing_type)).toEqual(['simple-complex', 'simple-complex'])
	})

	test('removes the pairing when given null', () => {
		const entities = [make_entity({ id: 0, pairing_concept: make_concept({ stem: 'water' }), pairing_type: 'dynamic-literal' })]

		apply_pairing({ entities, pairing_concept: null, pairing_type: null })

		expect(entities[0].pairing_concept).toBeNull()
		expect(entities[0].pairing_type).toBeNull()
	})
})

describe('do_pairings_differ', () => {
	test('is false when no entity has a pairing', () => {
		expect(do_pairings_differ({ entities: [make_entity({ id: 0 }), make_entity({ id: 1 })] })).toBe(false)
	})

	test('is false when the pairings match', () => {
		const pairing = { pairing_concept: make_concept({ stem: 'water' }), pairing_type: 'simple-complex' } as const
		const entities = [make_entity({ id: 0, ...pairing }), make_entity({ id: 1, ...pairing })]

		expect(do_pairings_differ({ entities })).toBe(false)
	})

	test('is true when only one entity has a pairing', () => {
		const entities = [
			make_entity({ id: 0, pairing_concept: make_concept({ stem: 'water' }), pairing_type: 'simple-complex' }),
			make_entity({ id: 1 }),
		]

		expect(do_pairings_differ({ entities })).toBe(true)
	})

	test('is true when only the pairing type differs', () => {
		const entities = [
			make_entity({ id: 0, pairing_concept: make_concept({ stem: 'water' }), pairing_type: 'simple-complex' }),
			make_entity({ id: 1, pairing_concept: make_concept({ stem: 'water' }), pairing_type: 'dynamic-literal' }),
		]

		expect(do_pairings_differ({ entities })).toBe(true)
	})
})

describe('apply_noun_list_index and do_noun_list_indexes_differ', () => {
	test('sets the index on every entity', () => {
		const entities = [make_entity({ id: 0, noun_list_index: '1' }), make_entity({ id: 1 })]

		apply_noun_list_index({ entities, index: '2' })

		expect(entities.map(({ noun_list_index }) => noun_list_index)).toEqual(['2', '2'])
		expect(do_noun_list_indexes_differ({ entities })).toBe(false)
	})

	test('differ is true when an entity has no index yet', () => {
		const entities = [make_entity({ id: 0, noun_list_index: '1' }), make_entity({ id: 1 })]

		expect(do_noun_list_indexes_differ({ entities })).toBe(true)
	})
})
