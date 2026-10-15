import { PUBLIC_ONTOLOGY_API_HOST } from '$app/env/public'
import { create_ontology_client } from '@tabitha/api-client'
import type { OntologyResult, ConceptKey } from '@tabitha/types'

const client = create_ontology_client({ base_url: PUBLIC_ONTOLOGY_API_HOST, cache: true })

export function create_fallback_ontology_data(concept: ConceptKey): OntologyResult {
	return {
		...concept,
		level: '',
		gloss: '',
		categorization: '',
		categories: [],
		status: 'in ontology',
		how_to_hints: [],
	}
}

const category_cache = new Map<string, OntologyResult[]>()

export async function fetch_all_concepts_for_part_of_speech(part_of_speech: string): Promise<OntologyResult[]> {
	if (category_cache.has(part_of_speech)) {
		return category_cache.get(part_of_speech) ?? []
	}

	try {
		const results = await client.get_all_for_category(part_of_speech)
		const filtered = results.filter(result => result.status === 'in ontology')
		category_cache.set(part_of_speech, filtered)
		return filtered
	} catch {
		return []
	}
}
