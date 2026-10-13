import { PUBLIC_SOURCES_API_HOST, PUBLIC_TARGETS_API_HOST } from '$env/static/public'
import { create_ontology_client, create_sources_client, create_targets_client } from '@tabitha/api-client'
import type { ConceptExample, ConceptKey, Reference, SourceResult, TargetTextData } from '@tabitha/types'

const sources_client = create_sources_client({ base_url: PUBLIC_SOURCES_API_HOST, cache: true })
const targets_client = create_targets_client({ base_url: PUBLIC_TARGETS_API_HOST, cache: true })
const ontology_client = create_ontology_client({ base_url: '/', cache: true })

export function get_sources_url({ type, id_primary, id_secondary, id_tertiary }: Reference): string {
	return `${PUBLIC_SOURCES_API_HOST}/${type}/${id_primary}/${id_secondary}/${id_tertiary}`
}

export async function get_source_data(reference: Reference): Promise<SourceResult | null> {
	return await sources_client.get_source(reference)
}

export async function get_examples(concept: ConceptKey): Promise<ConceptExample[] | null> {
	return await ontology_client.get_examples({ concept, source: 'Bible' })
}

export async function get_target_data(reference: Reference): Promise<TargetTextData | null> {
	return await targets_client.get_target_text({ ref: reference, project: 'English', preferred_audience: 'Unchurched Adults' })
}
