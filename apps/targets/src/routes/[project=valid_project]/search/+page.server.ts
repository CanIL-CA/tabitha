import { env } from '$env/dynamic/private'
import { PUBLIC_SOURCES_API_HOST } from '$env/static/public'
import { extract_exact_phrase } from '#lib/api_bible/search.server.js'
import { parse_search_query, search_text } from '#lib/server/search.js'
import { run_phrase_mode } from '#lib/server/phrase_mode.js'
import { MODE } from '#lib/search/modes.js'
import { record_usage_event, type SearchEvent } from '@tabitha/usage'
import type { PageServerLoad } from './$types'
import type { ReturnTo } from '#lib/types.js'
import type { TargetProject } from '@tabitha/types'

export async function load({ url: { searchParams }, params: { project }, locals: { db }, platform }: Parameters<PageServerLoad>[0]) {
	// the valid_project route matcher has already checked this against TARGET_PROJECTS
	const target_project = project as TargetProject

	const return_to_raw = searchParams.get('return_to')?.trim()
	const return_to: ReturnTo | undefined = return_to_raw ? JSON.parse(decodeURIComponent(return_to_raw)) : undefined

	const q = searchParams.get('q')?.trim()
	if (!q) {
		return { results: [], search_terms: [], phrase_results: null, return_to }
	}

	const record_search = (outcome: Pick<SearchEvent, 'scope' | 'result_count' | 'note'>) => record_usage_event({
		dataset: platform?.env.USAGE,
		app: 'targets',
		event: { kind: 'search', filter: target_project, q, referred_by: return_to?.app, ...outcome },
	})

	// anything other than an explicit reference-translation search -- including no mode at all, as
	// on every link written before that mode existed -- is the original target-text search
	if (searchParams.get('mode') === MODE.REFERENCE) {
		const phrase_results = await run_phrase_mode({
			phrase: q,
			project: target_project,
			api_key: env.API_BIBLE_KEY ?? '',
			sources_api_host: PUBLIC_SOURCES_API_HOST,
		})
		record_search({
			scope: MODE.REFERENCE,
			result_count: phrase_results.hits.length,
			note: phrase_results.notice ?? (phrase_results.complete ? '' : 'incomplete'),
		})

		// individual words, matching target-mode's shape below, so both the verse-text and
		// encoding-concept highlighting can treat every match the same way -- stripped of any
		// exact-phrase quoting, which isn't part of the words to highlight
		const highlight_words = (extract_exact_phrase(q) ?? q).split(/\s+/).filter(Boolean)

		return { results: [], search_terms: highlight_words, phrase_results, return_to }
	}

	const parsed_q = parse_search_query(q)
	const results = await search_text({ db, project: target_project, parsed_q })
	record_search({ scope: MODE.DEFAULT, result_count: results.length })

	return {
		results,
		search_terms: parsed_q.or_terms.flatMap(or_term => or_term.and_terms),
		phrase_results: null,
		return_to,
	}
}
