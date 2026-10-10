import { get_concepts } from '#lib/server/ontology.js'
import { get_function_words } from '#lib/server/function_words.js'
import { redirect } from '@sveltejs/kit'
import { PUBLIC_TARGETS_API_HOST } from '$env/static/public'
import { find_related_concepts } from '#lib/server/semantic_search.js'
import { record_usage_event } from '@tabitha/usage'
import type { PageServerLoad } from './$types'
import type { ConceptSearchFilter } from '@tabitha/types'

export async function load({ url: { searchParams }, locals: { db_ontology }, platform }: Parameters<PageServerLoad>[0]) {
	const search_filter: ConceptSearchFilter = {
		q: '',
		scope: 'stems',
		category: '',
		...Object.fromEntries(searchParams),
	}

	const record_search = (result_count: number | null) => {
		if (!search_filter.q) return
		const { scope, category, q } = search_filter
		record_usage_event({ dataset: platform?.env.USAGE, app: 'ontology', event: { kind: 'search', scope, filter: category, q, result_count } })
	}

	if (search_filter.scope === 'english') {
		record_search(null)
		const return_to = { app: 'ontology', q: search_filter.q }
		const return_to_url = encodeURIComponent(JSON.stringify(return_to))
		throw redirect(303, `${PUBLIC_TARGETS_API_HOST}/English/search?q=${search_filter.q}&return_to=${return_to_url}`)
	}

	const results = [
		...await get_concepts(db_ontology)(search_filter),
		...get_function_words(search_filter),
	]

	if (search_filter.scope === 'semantic') {
		const related = await find_related_concepts({ db: db_ontology, index: platform?.env.VECTORIZE_Concepts, search_term: search_filter.q })
		results.push(...related)
	}

	record_search(results.length)

	return {
		results,
	}
}
