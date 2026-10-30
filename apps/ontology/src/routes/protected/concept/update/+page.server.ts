import { get_concept_for_update } from '#lib/server/changes/concepts.js'
import { get_change_from_url, get_pending_changes_for_concept } from '#lib/server/changes/changes.js'
import { merge_change_values } from '#lib/changes/changes.js'
import { error } from '@sveltejs/kit'
import { parse_concept_key } from '@tabitha/types/patterns'
import type { ConceptKey } from '@tabitha/types'
import type { PageServerLoad } from './$types'

// Reaching this page only requires PROTECTED_ACCESS (enforced in hooks.server.ts for all /protected
// routes) -- UPDATE_CONCEPT is no longer required here, since a user without it can still submit an
// edit, it just gets recorded as a suggestion instead of applied immediately (see add_change).
// A 'change' URL parameter prefills the form from a suggested update (and identifies the concept), for editing it.
export async function load({ url: { searchParams }, locals }: Parameters<PageServerLoad>[0]) {
	const db = locals.db_ontology
	const change = await get_change_from_url({ searchParams, locals, action: 'update' })
	const concept_key = change?.concept ?? get_concept_from_url(searchParams)

	const concept_data = await get_concept_for_update({ db, concept_key })
	if (!concept_data) {
		throw error(400, 'Specified concept does not exist.')
	}

	const pending_changes = await get_pending_changes_for_concept({ db, concept_key })

	return {
		concept_data: change ? merge_change_values({ concept_data, change }) : concept_data,
		pending_changes: pending_changes.filter(pending => pending.id !== change?.id),
		change_id: change?.id,
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
