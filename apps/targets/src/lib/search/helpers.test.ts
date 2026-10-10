import { describe, expect, it } from 'vitest'
import { PUBLIC_SOURCES_API_HOST } from '$env/static/public'
import { build_filter_options, build_search_regex, filter_search_results, get_sources_url } from './helpers'
import { book_order_index } from '@tabitha/types/patterns'
import type { TargetTextResult } from '@tabitha/types'

const mockRealWorldResults: TargetTextResult[] = [
	{
		reference: { type: 'verse', id_primary: '1 Samuel', id_secondary: '21', id_tertiary: '1' },
		texts: [
			{ audience: 'Churched Adults', text: 'David went to Nob to meet Ahimelech the priest.' },
			{ audience: 'Unchurched Adults', text: 'David went to Nob to meet Ahimelech the priest. When Ahimelech saw David, he was afraid.' },
		],
	},
	{
		reference: { type: 'verse', id_primary: 'Ruth', id_secondary: '4', id_tertiary: '17' },
		texts: [
			{ audience: 'Churched Adults', text: 'The women named the child Obed. Obed became the father of Jesse, who was the father of David.' },
		],
	},
]

describe('search helpers', () => {
	it('sorts results by canonical Bible book order', () => {
		const sorted = mockRealWorldResults.slice().sort((a, b) => book_order_index(a) - book_order_index(b))
		expect(sorted[0].reference.id_primary).toBe('Ruth')
		expect(sorted[1].reference.id_primary).toBe('1 Samuel')
	})

	it('builds filter options correctly from search results', () => {
		const filters = build_filter_options(mockRealWorldResults)
		expect(filters.get('Book')).toEqual(['Any', 'Ruth', '1 Samuel'])
		expect(filters.get('Audience')).toEqual(['Any', 'Churched Adults', 'Unchurched Adults'])
	})

	it('filters search results by selected book and audience', () => {
		const filteredBook = filter_search_results({ matches: mockRealWorldResults, selected_filters: { Book: 'Ruth', Audience: 'Any' } })
		expect(filteredBook).toHaveLength(1)
		expect(filteredBook[0].reference.id_primary).toBe('Ruth')

		const filteredAudience = filter_search_results({ matches: mockRealWorldResults, selected_filters: { Book: 'Any', Audience: 'Unchurched Adults' } })
		expect(filteredAudience).toHaveLength(1)
		expect(filteredAudience[0].reference.id_primary).toBe('1 Samuel')
	})

	it('builds search term regex for text highlighting', () => {
		const regex = build_search_regex(['david', 'ahimelech'])
		expect('David went to meet Ahimelech'.split(regex)).toEqual(['', 'David', ' went to meet ', 'Ahimelech', ''])
	})

	it('builds the canonical sources URL for a reference', () => {
		const url = get_sources_url({ type: 'Bible', id_primary: '1 Samuel', id_secondary: '21', id_tertiary: '1' })
		expect(url).toBe(`${PUBLIC_SOURCES_API_HOST}/Bible/1 Samuel/21/1`)
	})
})
