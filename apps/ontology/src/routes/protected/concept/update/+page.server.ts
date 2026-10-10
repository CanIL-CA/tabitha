import { get_concept_for_update } from '#lib/server/changes/concepts.js'
import { error } from '@sveltejs/kit'
import { parse_concept_key } from '@tabitha/types/patterns'
import type { ConceptKey } from '@tabitha/types'
import type { PageServerLoad } from './$types'

// Reaching this page only requires PROTECTED_ACCESS (enforced in hooks.server.ts for all /protected
// routes) -- UPDATE_CONCEPT is no longer required here, since a user without it can still submit an
// edit, it just gets recorded as a suggestion instead of applied immediately (see add_change).
export async function load({ url: { searchParams }, locals }: Parameters<PageServerLoad>[0]) {
	const concept_key = get_concept_from_url(searchParams)

	const concept_data = await get_concept_for_update({ db: locals.db_ontology, concept_key })
	if (!concept_data) {
		throw error(400, 'Specified concept does not exist.')
	}

	return {
		concept_data,
	}
}

function get_concept_from_url(searchParams: URLSearchParams): ConceptKey {
	const concept_param = searchParams.get('concept')
	if (!concept_param) {
		throw error(400, "Missing 'concept' parameter. eg. 'love-A-Verb'")
	}
	const concept_key = parse_concept_key(concept_param)
	if (!concept_key) {
		throw error(400, "Expected 'concept' parameter in the form 'love-A-Verb'")
	}
	return concept_key
}
