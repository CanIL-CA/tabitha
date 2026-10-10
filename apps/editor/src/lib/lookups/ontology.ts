import { PUBLIC_ONTOLOGY_API_HOST } from '$env/static/public'
import { create_ontology_client } from '@tabitha/api-client'
import { LOOKUP_FILTERS } from '#lib/lookup_filters.js'
import { create_lookup_result } from '#lib/token.js'
import type { Token, LookupResult } from '#lib/types.js'
import type { OntologyResult } from '@tabitha/types'

const ontology_client = create_ontology_client({ base_url: PUBLIC_ONTOLOGY_API_HOST, cache: true })

export async function check_ontology(lookup_token: Token) {
	const results = (await Promise.all(lookup_token.lookup_terms.map(term => ontology_client.search_concepts({ q: term })))).flat()

	const found_results = results.reduce<LookupResult[]>((transformed_results, ontology_result) => transform_results({ transformed_results, ontology_result }), [])
	const not_found_results = lookup_token.lookup_results.filter(lookup => !results.some(LOOKUP_FILTERS.MATCHES_LOOKUP(lookup)))
	lookup_token.lookup_results = found_results.concat(not_found_results)

	function transform_results({ transformed_results, ontology_result }: {
		transformed_results: LookupResult[]
		ontology_result: OntologyResult
	}): LookupResult[] {
		const existing_result = lookup_token.lookup_results.find(LOOKUP_FILTERS.MATCHES_LOOKUP(ontology_result))
		const level_number = Number(ontology_result.level) >= 0 ? Number(ontology_result.level) : -1

		if (existing_result) {
			// The stem was found in the form lookup
			// Note: how_to_entries must be specified, otherwise the copied existing result will share the how_to_entries array
			transformed_results.push({
				...existing_result,
				...ontology_result,
				level: level_number,
				ontology_status: ontology_result.status,
				how_to_entries: ontology_result.how_to_hints,
			})

		} else if (ontology_result.stem.toLowerCase() !== lookup_token.lookup_terms[0].toLowerCase()) {
			// Don't include new results that don't match the original token lookup term
			// eg. 'covering' should not match the noun 'cover', even though it matches the ontology search for the verb stem 'cover'
			// don't add it to the results

		} else {
			// The word exists in the Ontology, but was not found in the form lookup
			// This is the case for concepts like 'take-away'
			transformed_results.push(create_lookup_result({
				...ontology_result,
				level: level_number,
				ontology_status: ontology_result.status,
				how_to_entries: ontology_result.how_to_hints,
			}))
		}

		return transformed_results
	}
}