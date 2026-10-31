import { default_categories } from '#lib/lookups.js'
import { merge_change_values } from '#lib/changes/changes.js'
import { get_change_from_url } from '#lib/server/changes/changes.js'
import { get_stem_senses } from '#lib/server/changes/concepts.js'
import { EMPTY_STEM_SENSES, combine_stem_senses } from '#lib/concept_form/stem_senses.js'
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
	if (!change) {
		return { concept_data: default_data, change_id: undefined, stem_senses: EMPTY_STEM_SENSES }
	}

	const concept_data = merge_change_values({ concept_data: default_data, change })
	const { stem, part_of_speech } = concept_data
	const server_senses = await get_stem_senses({ db: locals.db_ontology, stem, part_of_speech })

	return {
		concept_data,
		change_id: change.id,
		// unsynced creates live only in the browser, so the first lookup can't include them; the next lookup after an edit does
		stem_senses: combine_stem_senses({ stem, server_senses, unsynced_senses: [], excluded_change_id: change.id }),
	}
}
