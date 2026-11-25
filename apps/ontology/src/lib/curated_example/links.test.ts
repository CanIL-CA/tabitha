import { describe, expect, it } from 'vitest'
import { edit_curated_example_url, make_curated_example_url } from './links.js'
import type { ConceptKey } from '@tabitha/types'

const GIVE: ConceptKey = { stem: 'give', sense: 'A', part_of_speech: 'Verb' }

describe('make_curated_example_url', () => {
	it('names the concept and the verse', () => {
		const reference = { type: 'Bible', id_primary: 'Exodus', id_secondary: '2', id_tertiary: '3' }
		expect(make_curated_example_url({ concept: GIVE, reference })).toBe('/protected/concept/curated_example?concept=give-A-Verb&reference=Bible/Exodus/2/3')
	})

	it('keeps a name that has a space or other character that needs escaping', () => {
		const reference = { type: 'Bible', id_primary: '1 Samuel', id_secondary: '2', id_tertiary: '3' }
		const url = make_curated_example_url({ concept: { stem: 'cat', sense: 'A', part_of_speech: 'Noun' }, reference })
		const search_params = new URL(url, 'http://localhost').searchParams

		expect(search_params.get('concept')).toBe('cat-A-Noun')
		expect(search_params.get('reference')).toBe('Bible/1 Samuel/2/3')
	})
})

describe('edit_curated_example_url', () => {
	it('names the concept and which of its examples', () => {
		expect(edit_curated_example_url({ concept: GIVE, index: 2 })).toBe('/protected/concept/curated_example?concept=give-A-Verb&replaces=2')
	})
})
