import { error } from '@sveltejs/kit'
import { parse_concept_key } from '@tabitha/types/patterns'
import type { ConceptKey } from '@tabitha/types'

/** The concept that a page is for, from its 'concept' parameter, e.g. 'love-A-Verb' */
export function get_concept_from_search_params(search_params: URLSearchParams): ConceptKey {
	const concept_param = search_params.get('concept')
	if (!concept_param) {
		throw error(400, "Missing 'concept' parameter. eg. 'love-A-Verb'")
	}
	const concept_key = parse_concept_key(concept_param)
	if (!concept_key) {
		throw error(400, "Expected 'concept' parameter in the form 'love-A-Verb'")
	}
	return concept_key
}
