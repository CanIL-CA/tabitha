import { default_categories } from '#lib/lookups.js'
import { merge_change_values } from '#lib/changes/changes.js'
import { get_change_from_url } from '#lib/server/changes/changes.js'
import type { ConceptCreateData } from '#lib/types.js'
import type { PageServerLoad } from './$types'

// Reaching this page only requires PROTECTED_ACCESS (enforced in hooks.server.ts for all /protected
// routes) -- ADD_CONCEPT is no longer required here, since a user without it can still submit a new
// concept, it just gets recorded as a suggestion instead of applied immediately (see add_change).
// A 'change' URL parameter prefills the form from a suggested create, for editing it.
export async function load({ url: { searchParams }, locals }: Parameters<PageServerLoad>[0]) {
	const change = await get_change_from_url({ searchParams, locals, action: 'create' })

	const default_data: ConceptCreateData = {
		stem: '',
		sense: '',
		part_of_speech: 'Noun',
		level: '1',
		gloss: '(simple) ',
		brief_gloss: '',
		categories: default_categories.Noun?.slice() ?? [],
		curated_examples: '',
	}
	return {
		concept_data: change ? merge_change_values({ concept_data: default_data, change }) : default_data,
		change_id: change?.id,
	}
}
