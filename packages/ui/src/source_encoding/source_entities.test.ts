import { describe, expect, it } from 'vitest'
import type { SourceEntity } from '@tabitha/types'

function createMockEntity(overrides: Partial<SourceEntity>): SourceEntity {
	return {
		value: '',
		category: 'Clause',
		category_abbr: '',
		feature_codes: '',
		features: [],
		...overrides,
		concept: overrides.concept ?? null,
		pairing_concept: overrides.pairing_concept ?? null,
		pairing_type: overrides.pairing_type ?? null,
		noun_list_index: overrides.noun_list_index ?? null,
	}
}

/**
 * Real-world SourceEntity sequence extracted from 1 Chronicles 10:1 (semantic_encoding)
 */
const mockRealWorldEntities: SourceEntity[] = [
	createMockEntity({
		category: 'Clause',
		category_abbr: 'C',
		value: '{',
		feature_codes: 'IDp00NNNNNNNNNNNNN.............',
		features: [{ name: 'Clause Type', value: 'Independent' }],
	}),
	createMockEntity({
		category: 'Noun Phrase',
		category_abbr: 'NP',
		value: '(',
		feature_codes: 'SAN.N........',
		features: [{ name: 'Semantic Role', value: 'Agent' }],
	}),
	createMockEntity({
		category: 'Noun',
		category_abbr: 'N',
		value: 'Philistine',
		feature_codes: '1A2PDAnK3NN........',
		features: [
			{ name: 'Number', value: 'Plural' },
			{ name: 'Person', value: 'Third' },
		],
		concept: { stem: 'Philistine', sense: 'A', part_of_speech: 'Noun' },
	}),
	createMockEntity({
		category: '',
		category_abbr: '',
		value: ')',
		feature_codes: '',
	}),
	createMockEntity({
		category: 'Verb Phrase',
		category_abbr: 'VP',
		value: '(',
		feature_codes: 'S.....',
		features: [{ name: 'Aspect', value: 'Unmarked' }],
	}),
	createMockEntity({
		category: 'Verb',
		category_abbr: 'V',
		value: 'fight',
		feature_codes: '1ArUINAN...........',
		features: [
			{ name: 'Time', value: 'Discourse' },
			{ name: 'Mood', value: 'Indicative' },
		],
		concept: { stem: 'fight', sense: 'A', part_of_speech: 'Verb' },
	}),
	createMockEntity({
		category: '',
		category_abbr: '',
		value: ')',
		feature_codes: '',
	}),
	createMockEntity({
		category: '',
		category_abbr: '',
		value: '}',
		feature_codes: '',
	}),
	createMockEntity({
		category: 'Clause',
		category_abbr: 'C',
		value: '{',
		feature_codes: 'IDp00NNNNNNNNNNNNN.............',
		features: [{ name: 'Clause Type', value: 'Independent' }],
	}),
	createMockEntity({
		category: 'Conjunction',
		category_abbr: 'C',
		value: 'and',
		feature_codes: '1A.....',
		concept: { stem: 'and', sense: 'A', part_of_speech: 'Conjunction' },
	}),
	createMockEntity({
		category: 'Noun Phrase',
		category_abbr: 'NP',
		value: '(',
		feature_codes: 'SAN.N........',
		features: [{ name: 'Semantic Role', value: 'Agent' }],
	}),
	createMockEntity({
		category: 'Noun',
		category_abbr: 'N',
		value: 'Israelite',
		feature_codes: '1A4PDAnK3NN........',
		features: [
			{ name: 'Number', value: 'Plural' },
			{ name: 'Person', value: 'Third' },
		],
		concept: { stem: 'Israelite', sense: 'A', part_of_speech: 'Noun' },
	}),
	createMockEntity({
		category: '',
		category_abbr: '',
		value: ')',
		feature_codes: '',
	}),
	createMockEntity({
		category: '',
		category_abbr: '',
		value: '}',
		feature_codes: '',
	}),
]

describe('SourceEntities clause reducer', () => {
	it('groups real-world flat entities into separate clause arrays on opening brace', () => {
		const clauses = mockRealWorldEntities.reduce((grouped, entity) => {
			if (entity.value === '{') {
				grouped.push([])
			}

			const last_clause = grouped[grouped.length - 1]
			if (last_clause) {
				last_clause.push(entity)
			}

			return grouped
		}, [] as SourceEntity[][])
		expect(clauses).toHaveLength(2)
		expect(clauses[0]).toHaveLength(8)
		expect(clauses[1]).toHaveLength(6)

		expect(clauses[0][0].value).toBe('{')
		expect(clauses[0][2].value).toBe('Philistine')
		expect(clauses[0][2].concept).toEqual({ stem: 'Philistine', sense: 'A', part_of_speech: 'Noun' })

		expect(clauses[1][0].value).toBe('{')
		expect(clauses[1][1].value).toBe('and')
		expect(clauses[1][3].value).toBe('Israelite')
	})
})
