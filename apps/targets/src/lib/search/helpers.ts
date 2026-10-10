import { book_order_index } from '@tabitha/types/patterns'
import { create_sources_client } from '@tabitha/api-client'
import { PUBLIC_SOURCES_API_HOST } from '$env/static/public'
import type { Reference, TargetTextResult, SourceResult } from '@tabitha/types'
import type { FilterMap } from '../types'

const sources_client = create_sources_client({ base_url: PUBLIC_SOURCES_API_HOST, cache: true })

export function get_sources_url({ type, id_primary, id_secondary, id_tertiary }: Reference): string {
	return `${PUBLIC_SOURCES_API_HOST}/${type}/${id_primary}/${id_secondary}/${id_tertiary}`
}

export async function fetch_source_data(reference: Reference): Promise<SourceResult | null> {
	return await sources_client.get_source(reference)
}

export function build_filter_options(matches: TargetTextResult[]): FilterMap {
	const filter_map: FilterMap = new Map()

	const book_names_found_in_examples = [...new Set(matches.toSorted((a, b) => book_order_index(a) - book_order_index(b)).map(result => result.reference.id_primary))]
	filter_map.set('Book', ['Any', ...book_names_found_in_examples])

	const audiences_found_in_examples = [...new Set(matches.flatMap(result => result.texts.map(t => t.audience)))].sort()
	filter_map.set('Audience', ['Any', ...audiences_found_in_examples])

	return filter_map
}

export function filter_search_results({ matches, selected_filters }: {
	matches: TargetTextResult[]
	selected_filters: Record<string, string>
}): TargetTextResult[] {
	return matches.filter(result => {
		const selected_book = selected_filters['Book']
		if (selected_book && selected_book !== 'Any' && result.reference.id_primary !== selected_book) {
			return false
		}

		const selected_audience = selected_filters['Audience']
		if (selected_audience && selected_audience !== 'Any' && !result.texts.some(t => t.audience === selected_audience)) {
			return false
		}

		return true
	})
}

export function build_search_regex(search_terms: string[]): RegExp {
	if (!search_terms.length) {
		return /(?:)/gi
	}
	const pattern = search_terms.join('|').toLowerCase().replaceAll(/[%#*]/g, '.*?')
	return new RegExp(`(${pattern})`, 'gi')
}
