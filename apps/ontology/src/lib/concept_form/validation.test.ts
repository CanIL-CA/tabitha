import { describe, expect, it } from 'vitest'
import { validate_concept } from './validation'
import type { ConceptCreateData } from '#lib/types.js'

const concept_with_stem = (stem: string) => ({ stem, categories: [] as string[] }) as ConceptCreateData

const concept_with_categories = (categories: string[]) => ({ stem: 'quickly', categories }) as ConceptCreateData

const stem_messages = ({ stem, kind }: { stem: string, kind: 'errors' | 'warnings' }) =>
	validate_concept(concept_with_stem(stem))[kind].stem ?? []

describe('validate_concept stem errors', () => {
	it.each([
		['love', false],
		['', false],
		['bad stem', true],
		['love ', true],
		['love\t', true],
	])('%j → has error: %s', (stem, expected) => {
		expect(stem_messages({ stem, kind: 'errors' }).length > 0).toBe(expected)
	})
})

describe('validate_concept stem warnings', () => {
	it.each([
		['love-A', true],
		['love-Z', true],
		['love', false],
		['love-a', false],
		['love-AB', false],
		['self-control', false],
		['love-A ', false],
	])('%j → has warning: %s', (stem, expected) => {
		expect(stem_messages({ stem, kind: 'warnings' }).length > 0).toBe(expected)
	})
})

describe('validate_concept categories errors', () => {
	it.each([
		[[], false],
		[['always used in Clauses to modify Verbs', 'never used in Noun Phrases'], false],
		[['sometimes used in Clauses to modify Verbs', 'sometimes used in Noun Phrases'], false],
		[['always used in Clauses to modify Verbs', 'always used in Noun Phrases'], true],
		[['always used in Clauses to modify Verbs', 'always used in Noun Phrases', 'always used in Adjective Phrases'], true],
	])('%j → has error: %s', (categories, expected) => {
		const { errors } = validate_concept(concept_with_categories(categories))
		expect((errors.categories ?? []).length > 0).toBe(expected)
	})
})

it('returns no issues for a clean concept', () => {
	expect(validate_concept(concept_with_stem('love'))).toEqual({ errors: {}, warnings: {} })
})
