import { describe, expect, test } from 'vitest'
import { get_matches, match_pattern } from './tree_pattern_match'
import type { CopilotEncodingEntity, FlagExtractionRule, PatternEntity } from '#lib/types.js'

const verb = (overrides: Partial<CopilotEncodingEntity> = {}): CopilotEncodingEntity => ({ category: 'Verb', concept: 'go-01', ...overrides })

describe('match_pattern', () => {
	test('matches a node on category and captures it by name', () => {
		const root = verb()

		const [match] = match_pattern({ pattern: { name: '$anchor', category: 'Verb' }, root_entity: root })

		expect(match.success).toBe(true)
		expect(match.captures['$anchor']).toEqual({ node: root, indexStack: [] })
	})

	test('returns nothing when the category differs', () => {
		expect(match_pattern({ pattern: { category: 'Noun' }, root_entity: verb() })).toEqual([])
	})

	test('searches descendants depth first and records each match\'s index stack', () => {
		const root: CopilotEncodingEntity = {
			category: 'Clause',
			children: [
				{ category: 'Noun', concept: 'Paul' },
				{ category: 'Noun Phrase', children: [{ category: 'Noun', concept: 'letter' }] },
			],
		}

		const matches = match_pattern({ pattern: { name: '$anchor', category: 'Noun' }, root_entity: root })

		const stacks = matches.map(match => match.captures['$anchor'].indexStack)
		expect(stacks).toHaveLength(2)
		expect(stacks).toEqual(expect.arrayContaining([[0], [1, 0]]))
	})

	test('alternatives separated by a bar match any one of them', () => {
		const pattern: PatternEntity = { category: 'Verb', concept: 'go-01 | come-01' }

		expect(match_pattern({ pattern, root_entity: verb({ concept: 'come-01' }) })).toHaveLength(1)
		expect(match_pattern({ pattern, root_entity: verb({ concept: 'stay-01' }) })).toHaveLength(0)
	})

	test('binds a variable to the matched value', () => {
		const [match] = match_pattern({ pattern: { category: 'Verb', concept: '$concept' }, root_entity: verb() })

		expect(match.bindings['$concept']).toBe('go-01')
	})

	test('a variable that is already bound must match the same value again', () => {
		const pattern: PatternEntity = {
			category: 'Clause',
			children: [
				{ category: 'Noun', concept: '$same' },
				{ category: 'Verb', concept: '$same' },
			],
		}
		const matching: CopilotEncodingEntity = { category: 'Clause', children: [{ category: 'Noun', concept: 'light' }, { category: 'Verb', concept: 'light' }] }
		const differing: CopilotEncodingEntity = { category: 'Clause', children: [{ category: 'Noun', concept: 'light' }, { category: 'Verb', concept: 'dark' }] }

		expect(match_pattern({ pattern, root_entity: matching })).toHaveLength(1)
		expect(match_pattern({ pattern, root_entity: differing })).toHaveLength(0)
	})

	test('a variable does not match a missing or empty value', () => {
		const pattern: PatternEntity = { category: 'Verb', features: { Time: '$time' } }

		expect(match_pattern({ pattern, root_entity: verb({ features: { Time: '' } }) })).toHaveLength(0)
	})

	test('requires every pattern feature to be present on the node', () => {
		const pattern: PatternEntity = { category: 'Verb', features: { Time: 'Past', Mood: 'Imperative' } }

		expect(match_pattern({ pattern, root_entity: verb({ features: { Time: 'Past' } }) })).toHaveLength(0)
		expect(match_pattern({ pattern, root_entity: verb({ features: { Time: 'Past', Mood: 'Imperative', Aspect: 'Routine' } }) })).toHaveLength(1)
	})

	test('a pattern key the node lacks entirely does not match', () => {
		expect(match_pattern({ pattern: { category: 'Verb', pairing_concept: 'x' }, root_entity: verb() })).toEqual([])
	})

	test('matches children in any order, using each child once', () => {
		const pattern: PatternEntity = { category: 'Clause', children: [{ category: 'Verb' }, { category: 'Noun' }] }
		const reversed: CopilotEncodingEntity = { category: 'Clause', children: [{ category: 'Noun' }, { category: 'Verb' }] }
		const only_nouns: CopilotEncodingEntity = { category: 'Clause', children: [{ category: 'Noun' }, { category: 'Noun' }] }

		expect(match_pattern({ pattern, root_entity: reversed })).toHaveLength(1)
		expect(match_pattern({ pattern, root_entity: only_nouns })).toHaveLength(0)
	})

	test('two child patterns cannot share one child node', () => {
		const pattern: PatternEntity = { category: 'Clause', children: [{ category: 'Noun' }, { category: 'Noun' }] }
		const one_noun: CopilotEncodingEntity = { category: 'Clause', children: [{ category: 'Noun' }] }

		expect(match_pattern({ pattern, root_entity: one_noun })).toHaveLength(0)
	})

	test('an optional child pattern may be absent, and a required one may not', () => {
		const optional: PatternEntity = { category: 'Clause', children: [{ category: 'Verb' }, { category: 'Adverb', optional: true }] }
		const required: PatternEntity = { category: 'Clause', children: [{ category: 'Verb' }, { category: 'Adverb' }] }
		const root: CopilotEncodingEntity = { category: 'Clause', children: [{ category: 'Verb' }] }

		expect(match_pattern({ pattern: optional, root_entity: root })).toHaveLength(1)
		expect(match_pattern({ pattern: required, root_entity: root })).toHaveLength(0)
	})

	test('a pattern with children does not match a node without any', () => {
		expect(match_pattern({ pattern: { category: 'Verb', children: [{ category: 'Noun' }] }, root_entity: verb() })).toEqual([])
	})

	test('captures from child patterns carry the child\'s index stack', () => {
		const pattern: PatternEntity = { category: 'Clause', children: [{ name: '$object', category: 'Noun' }] }
		const root: CopilotEncodingEntity = { category: 'Clause', children: [{ category: 'Verb' }, { category: 'Noun', concept: 'letter' }] }

		const [match] = match_pattern({ pattern, root_entity: root })

		expect(match.captures['$object'].indexStack).toEqual([1])
		expect(match.captures['$object'].node.concept).toBe('letter')
	})
})

describe('get_matches', () => {
	const extractions: FlagExtractionRule[] = [{
		flag: 'Verb Time',
		rules: [{ value: '$time', pattern: { name: '$anchor', category: 'Verb', features: { Time: '$time' } } }],
	}]

	test('tags each match with its flag and rule', () => {
		const root: CopilotEncodingEntity = { category: 'Root', children: [verb({ features: { Time: 'Yesterday' } })] }

		const [match] = get_matches({ root_entity: root, extractions })

		expect(match.flag).toBe('Verb Time')
		expect(match.bindings['$time']).toBe('Yesterday')
		expect(match.captures['$anchor'].indexStack).toEqual([0])
	})

	test('finds a match on every node in the tree', () => {
		const root: CopilotEncodingEntity = {
			category: 'Root',
			children: [verb({ features: { Time: 'Yesterday' } }), { category: 'Clause', children: [verb({ features: { Time: 'Tomorrow' } })] }],
		}

		const times = get_matches({ root_entity: root, extractions }).map(match => match.bindings['$time'])

		expect(times.toSorted()).toEqual(['Tomorrow', 'Yesterday'])
	})

	test('yields nothing for a tree with no match', () => {
		expect(get_matches({ root_entity: { category: 'Root', children: [{ category: 'Noun' }] }, extractions })).toEqual([])
	})
})
