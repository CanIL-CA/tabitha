import { PUBLIC_ONTOLOGY_API_HOST } from '$app/env/public'
import { create_ontology_client, create_sources_client } from '@tabitha/api-client'
import { structure_entities } from '#lib/encoding/structured.js'
import type { OntologyResult, ConceptKey, SourceEntity } from '@tabitha/types'
import type { AnalyzedTextResult } from '#lib/types.js'

const client = create_ontology_client({ base_url: PUBLIC_ONTOLOGY_API_HOST })
const sources_client = create_sources_client({ base_url: '/' })

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

export function get_page_concepts(entities: SourceEntity[]): ConceptKey[] {
	return entities
		.flatMap(({ concept, pairing_concept }) => [concept, pairing_concept])
		.filter(concept => concept !== null)
}

/**
 * Looks up every concept on a page in one batched request, so the page's components only read
 * the result. A failed lookup degrades to an empty map, and components show fallback data.
 */
export async function fetch_ontology_data_for_all(entities: SourceEntity[]): Promise<Record<string, OntologyResult[]>> {
	const stems = [...new Set(get_page_concepts(entities).map(({ stem }) => stem))]
	if (!stems.length) return {}

	try {
		return await client.search_concepts_batch({ terms: stems })
	} catch {
		return {}
	}
}

/** Analyzes phase 1 text into structured source entities, along with the ontology results for their concepts. Throws if analysis fails. */
export async function fetch_analyzed_text({ text }: { text: string }): Promise<AnalyzedTextResult> {
	const result = await sources_client.analyze_text(text)
	if (!result) throw new Error('Analyze API failed')

	const source_entities = result.source_entities.map(entity => ({ ...entity, id: -1, parent_id: -1, boundary_category: '' }))
	structure_entities(source_entities)

	const results_by_stem = await fetch_ontology_data_for_all(source_entities)
	return { source_entities, ontology_results: Object.values(results_by_stem).flat() }
}
