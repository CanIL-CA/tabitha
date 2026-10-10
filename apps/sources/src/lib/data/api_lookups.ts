import { PUBLIC_ONTOLOGY_API_HOST } from '$env/static/public'
import { create_ontology_client } from '@tabitha/api-client'
import type { OntologyResult, ConceptKey } from '@tabitha/types'
import type { PageSourceConcept } from '#lib/types.js'

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

/**
 * Fetch ontology definition for a single concept without mutating the input object
 */
export async function fetch_concept_ontology_data(concept: PageSourceConcept): Promise<OntologyResult> {
	if (concept.ontology_data) {
		return concept.ontology_data
	}

	const fallback = create_fallback_ontology_data(concept)

	try {
		const res = await client.get_concept(concept)
		return res ?? fallback
	} catch {
		return fallback
	}
}

const all_senses_cache = new Map<string, OntologyResult[]>()
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

export async function fetch_ontology_data_for_all_senses(concept: ConceptKey): Promise<OntologyResult[]> {
	const { stem, part_of_speech } = concept
	const cache_key = `${stem}:${part_of_speech}`

	if (all_senses_cache.has(cache_key)) {
		return all_senses_cache.get(cache_key) ?? []
	}

	try {
		const results = await client.search_concepts({ q: stem, category: part_of_speech })
		const filtered = results.filter(result => result.stem === stem && result.status === 'in ontology')
		all_senses_cache.set(cache_key, filtered)
		return filtered
	} catch {
		return []
	}
}
