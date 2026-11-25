import { describe, expect, test } from 'vitest'
import { build_curated_example_link } from './curated_example_link'
import type { CaseFrameIssue, ValidationIssue } from './validation'
import type { PageSourceEntity } from '#lib/types.js'
import type { ConceptKey } from '@tabitha/types'

const GIVE: ConceptKey = { stem: 'give', sense: 'A', part_of_speech: 'Verb' }
const HAND_OVER: ConceptKey = { stem: 'hand over', sense: 'A', part_of_speech: 'Verb' }
const reference = { type: 'Bible', id_primary: 'Exodus', id_secondary: '2', id_tertiary: '3' }
const ontology_host = 'https://ontology.example'

const entity = (overrides: Partial<PageSourceEntity>): PageSourceEntity => ({
	category: '', category_abbr: '', value: '', concept: null, pairing_concept: null, pairing_type: null,
	feature_codes: '', features: [], noun_list_index: null, id: -1, parent_id: -1, boundary_category: '', ...overrides,
})

// the word is at index 2
const source_entities = [entity({}), entity({}), entity({ category: 'Verb', value: 'give', concept: GIVE, pairing_concept: HAND_OVER, pairing_type: 'simple-complex' })]

const mismatch: CaseFrameIssue = {
	check: 'case_frame', reason: 'frame_mismatch', category: 'Verb', concept: GIVE, entity_id: 2,
	present: ['Agent-like'], current_categories: ['Agent-like'], missing_required: [], unexpected: [],
}

const link = (issue: ValidationIssue) => build_curated_example_link({ issue, source_entities, reference, ontology_host })

describe('build_curated_example_link', () => {
	test('links to the ontology page for the concept, the verse and the word', () => {
		expect(link(mismatch)).toBe('https://ontology.example/protected/concept/curated_example?concept=give-A-Verb&reference=Bible/Exodus/2/3&entity=2')
	})

	test('uses the first entity of a concept that has no categories', () => {
		const issue: CaseFrameIssue = { check: 'case_frame', reason: 'no_categories', category: 'Verb', concept: GIVE, present: [], entity_ids: [2, 9] }
		expect(link(issue)).toContain('&entity=2')
	})

	test('escapes names that need it', () => {
		const url = build_curated_example_link({
			issue: { ...mismatch, concept: { stem: 'cat', sense: 'A', part_of_speech: 'Verb' } },
			source_entities: [entity({}), entity({}), entity({ concept: { stem: 'cat', sense: 'A', part_of_speech: 'Verb' } })],
			reference: { ...reference, id_primary: '1 Samuel' },
			ontology_host,
		})
		const search_params = new URL(url ?? '').searchParams

		expect(search_params.get('concept')).toBe('cat-A-Verb')
		expect(search_params.get('reference')).toBe('Bible/1 Samuel/2/3')
	})

	test('has no link when the issue is about the pairing concept of the word, which the ontology cannot find', () => {
		expect(link({ ...mismatch, concept: HAND_OVER })).toBeUndefined()
	})

	test('has no link for an issue that is not about a case frame', () => {
		expect(link({ check: 'alternate', entity_id: 2, feature_name: 'x', value: 'y', expected: { direction: 'after', values: [] } })).toBeUndefined()
	})
})
