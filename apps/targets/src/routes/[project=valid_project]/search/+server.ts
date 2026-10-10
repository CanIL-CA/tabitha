import { env } from '$env/dynamic/private'
import { PUBLIC_SOURCES_API_HOST } from '$env/static/public'
import { parse_search_query, search_text } from '#lib/server/search.js'
import { run_phrase_mode } from '#lib/server/phrase_mode.js'
import { MODE } from '#lib/search/modes.js'
import type { RequestHandler } from '@sveltejs/kit'
import type { TargetProject } from '@tabitha/types'

export async function GET({ locals: { db }, params: { project }, url: { searchParams } }: Parameters<RequestHandler>[0]) {
	const q = searchParams.get('q')?.trim()
	if (!q) {
		return Response.json([])
	}

	if (searchParams.get('mode') === MODE.REFERENCE) {
		const { hits, complete, notice } = await run_phrase_mode({
			phrase: q,
			// the valid_project route matcher has already checked this against TARGET_PROJECTS
			project: project as TargetProject,
			api_key: env.API_BIBLE_KEY ?? '',
			sources_api_host: PUBLIC_SOURCES_API_HOST,
		})

		// References only, deliberately: the matching verse text is licensed scripture, and the
		// license is conditioned on reporting each view through FUMS -- which we can only do for
		// pages we render ourselves. Callers who need the text fetch it from api.bible under
		// their own license; see apps/targets/README.md. Every returned reference is guaranteed
		// to have a semantic encoding -- hits without one are dropped before this point, since an
		// exemplar with no structure to show isn't useful to whoever's searching.
		return Response.json({
			matches: hits.map(({ reference }) => ({ reference })),
			complete,
			notice,
		})
	}

	const parsed_q = parse_search_query(q)
	const results = await search_text({ db, project: project!, parsed_q })
	return Response.json(results)
}
