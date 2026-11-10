import { describe, expect, it } from 'vitest'
import { calculate_noun_list_index, calculate_noun_list_position, encode_value, structure_semantic_encoding } from './semantic_encoding'
import type { SourceEntity } from '@tabitha/types'

describe('encode_value', () => {
	it('encodes paired concepts correctly', () => {
		const entity: SourceEntity = {
			category: 'Noun',
			category_abbr: 'N',
			value: 'god',
			feature_codes: '1A1s',
			features: [],
			concept: { stem: 'god', sense: 'A', part_of_speech: 'Noun' },
			pairing_concept: { stem: 'creator', sense: 'B', part_of_speech: 'Noun' },
			pairing_type: 'simple-complex',
			noun_list_index: null,
		}

		const result = encode_value(entity)
		expect(result).toBe('god/Bcreator')
	})

	it('encodes single concept correctly', () => {
		const entity: SourceEntity = {
			category: 'Noun',
			category_abbr: 'N',
			value: 'god',
			feature_codes: '1A1s',
			features: [],
			concept: { stem: 'God', sense: 'A', part_of_speech: 'Noun' },
			pairing_concept: null,
			pairing_type: null,
			noun_list_index: null,
		}

		const result = encode_value(entity)
		expect(result).toBe('God')
	})

	it('returns value unchanged when no concept exists', () => {
		const entity: SourceEntity = {
			category: 'period',
			category_abbr: '.',
			value: '.',
			feature_codes: '',
			features: [],
			concept: null,
			pairing_concept: null,
			pairing_type: null,
			noun_list_index: null,
		}

		const result = encode_value(entity)
		expect(result).toBe('.')
	})
})

describe('structure_semantic_encoding', () => {
	it('assigns ids and structures boundary hierarchy', () => {
		const rawEntities: SourceEntity[] = [
			{
				category: 'Clause',
				category_abbr: 'C',
				value: '{',
				feature_codes: '',
				features: [],
				concept: null,
				pairing_concept: null,
				pairing_type: null,
				noun_list_index: null,
			},
			{
				category: 'Noun',
				category_abbr: 'N',
				value: 'God',
				feature_codes: 's',
				features: [],
				concept: { stem: 'God', sense: 'A', part_of_speech: 'Noun' },
				pairing_concept: null,
				pairing_type: null,
				noun_list_index: '1',
			},
			{
				category: 'Clause',
				category_abbr: 'C',
				value: '}',
				feature_codes: '',
				features: [],
				concept: null,
				pairing_concept: null,
				pairing_type: null,
				noun_list_index: null,
			},
		]

		const structured = structure_semantic_encoding(rawEntities)
		expect(structured).toHaveLength(3)
		expect(structured[0].id).toBe(0)
		expect(structured[1].id).toBe(1)
		expect(structured[2].id).toBe(2)
		expect(structured[1].parent_id).toBe(0) // Child of the open clause
	})
})

describe('calculate_noun_list_index and calculate_noun_list_position', () => {
	it.each([
		[0, '1'],
		[8, '9'],
		[9, 'A'],
		[10, 'B'],
		[34, 'Z'],
	])('maps position %i to index %s and back', (position, index) => {
		expect(calculate_noun_list_index(position)).toBe(index)
		expect(calculate_noun_list_position(index)).toBe(position)
	})
})
