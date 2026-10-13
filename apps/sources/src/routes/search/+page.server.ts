import { error, redirect } from '@sveltejs/kit'
import { record_usage_event, type SearchEvent } from '@tabitha/usage'
import { search_phase_1 } from '#lib/data/phase_1_search.js'
import { is_reference_query, parse_reference } from '#lib/data/ref_parser.js'
import type { PageServerLoad } from './$types'

export async function load({ locals: { db }, url: { searchParams }, platform }: Parameters<PageServerLoad>[0]) {
	const q = searchParams.get('q')?.trim() ?? ''

	const record_search = (outcome: Pick<SearchEvent, 'scope' | 'result_count' | 'note'>) => {
		if (!q) return
		record_usage_event({ dataset: platform?.env.USAGE, app: 'sources', event: { kind: 'search', filter: '', q, ...outcome } })
	}

	if (is_reference_query(q)) {
		const parsed_ref = parse_reference(q)
		if (!parsed_ref) {
			record_search({ scope: 'reference', result_count: 0, note: 'invalid_reference' })
			error(400, 'Invalid reference format. Must be in the format "(book) (chapter):(verse)", "(book) (chapter)", or "(book)"')
		}
		const { type, id_primary, id_secondary, id_tertiary } = parsed_ref

		record_search({ scope: 'reference', result_count: null })
		redirect(303, `/${type}/${id_primary}/${id_secondary}/${id_tertiary}`)
	}

	const results = await search_phase_1({ db, q })
	record_search({ scope: 'text', result_count: results.total_count })

	return {
		q,
		results,
	}
}
