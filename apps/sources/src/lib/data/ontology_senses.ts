import { PUBLIC_ONTOLOGY_API_HOST } from '$app/env/public'
import { create_ontology_client } from '@tabitha/api-client'
import type { ConceptKey, OntologyResult } from '@tabitha/types'
import type { PageSourceConcept, PageSourceEntity } from '#lib/types.js'
import { create_fallback_ontology_data } from './api_lookups'

/** Every in-ontology sense of a stem, keyed by `concept_senses_key` (stem and part of speech). */
export type SensesByConcept = Partial<Record<string, OntologyResult[]>>

type StemAndPartOfSpeech = Pick<ConceptKey, 'stem' | 'part_of_speech'>

const client = create_ontology_client({ base_url: PUBLIC_ONTOLOGY_API_HOST })

export function concept_senses_key({ stem, part_of_speech }: StemAndPartOfSpeech): string {
	return `${stem}:${part_of_speech}`
}

export function get_page_concepts(entities: PageSourceEntity[]): ConceptKey[] {
	return entities
		.flatMap(({ concept, pairing_concept }) => [concept, pairing_concept])
		.filter(concept => concept !== null)
}

export function group_senses_by_concept(results: OntologyResult[]): SensesByConcept {
	const in_ontology = results.filter(result => result.status === 'in ontology')
	const unique = [...new Map(in_ontology.map(result => [`${concept_senses_key(result)}-${result.sense}`, result])).values()]

	return Object.groupBy(unique, concept_senses_key)
}

export function find_senses({ senses, concept }: { senses: SensesByConcept, concept: StemAndPartOfSpeech }): OntologyResult[] {
	return senses[concept_senses_key(concept)] ?? []
}

/** The concept's own ontology data when it carries some (e.g. just picked in the editor), else its sense from `senses`. */
export function find_sense({ senses, concept }: { senses: SensesByConcept, concept: PageSourceConcept }): OntologyResult {
	return concept.ontology_data
		?? find_senses({ senses, concept }).find(({ sense }) => sense === concept.sense)
		?? create_fallback_ontology_data(concept)
}

/**
 * Looks up every concept on a page in one batched request, so the page's components only read
 * the result. A failed lookup degrades to an empty map, and components show fallback data.
 */
export async function load_ontology_senses(entities: PageSourceEntity[]): Promise<SensesByConcept> {
	const stems = [...new Set(get_page_concepts(entities).map(({ stem }) => stem))]
	if (!stems.length) return {}

	try {
		const results_by_term = await client.search_concepts_batch({ terms: stems })
		return group_senses_by_concept(Object.values(results_by_term).flat())
	} catch {
		return {}
	}
}
