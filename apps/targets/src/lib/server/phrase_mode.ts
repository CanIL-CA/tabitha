import { create_sources_client } from '@tabitha/api-client'
import { search_phrase } from '#lib/api_bible/search.server.js'
import type { PhraseMatch, PhraseSearchHit, PhraseSearchResults } from '#lib/types.js'
import type { SourceEncodedResult, TargetProject } from '@tabitha/types'

/**
 * Keeps only the matches Sources actually holds a semantic encoding for -- a verse with no
 * structure to show isn't a useful exemplar, so it's dropped rather than shown as unavailable.
 *
 * Matched to `matches` by array position, not by comparing the reference each result carries --
 * `get_verse_encoding_availability` maps over the request array in order, so this is safe. If
 * the lookup fails outright the api-client returns `null` rather than a partial array, which
 * this also treats as "no encoding" for every verse, the safe way to be wrong.
 */
export function filter_to_encoded_matches({ matches, availability }: {
	matches: PhraseMatch[]
	availability: SourceEncodedResult[] | null
}): PhraseSearchHit[] {
	return matches.filter((_, index) => availability?.[index]?.has_encoding ?? false)
}

/**
 * Runs the phrase mode: find the verses containing a phrase in the project's scripture, then
 * keep only the ones with a real structure to show -- what's worth surfacing to someone hunting
 * for an exemplar, not the full set of scripture matches.
 *
 * Sources answers a whole batch of references in one request, so the second half stays a single
 * round trip however many verses the phrase turned up.
 */
export async function run_phrase_mode({ phrase, project, api_key, sources_api_host }: {
	phrase: string
	project: TargetProject
	api_key: string
	sources_api_host: string
}): Promise<PhraseSearchResults> {
	const outcome = await search_phrase({ phrase, project, api_key })

	if (outcome.kind !== 'ok') {
		return { hits: [], complete: true, fums_token: null, notice: outcome.kind }
	}

	if (!outcome.matches.length) {
		return { hits: [], complete: outcome.complete, fums_token: outcome.fums_token, notice: null }
	}

	const sources = create_sources_client({ base_url: sources_api_host, cache: true })
	const availability = await sources.get_verse_encoding_availability(outcome.matches.map(match => match.reference))

	return {
		hits: filter_to_encoded_matches({ matches: outcome.matches, availability }),
		complete: outcome.complete,
		fums_token: outcome.fums_token,
		notice: null,
	}
}
