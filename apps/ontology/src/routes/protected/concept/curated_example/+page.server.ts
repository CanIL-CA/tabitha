import { PUBLIC_SOURCES_API_HOST } from '$app/env/public'
import { get_pending_changes_for_concept } from '#lib/server/changes/changes.js'
import { get_concept_for_update } from '#lib/server/changes/concepts.js'
import { get_concept_from_search_params } from '#lib/server/concept_param.js'
import { find_curated_example_source } from '#lib/server/curated_example_source.js'
import { error } from '@sveltejs/kit'
import { create_sources_client } from '@tabitha/api-client'
import type { Reference } from '@tabitha/types'
import type { PageServerLoad } from './$types'

const sources_client = create_sources_client({ base_url: PUBLIC_SOURCES_API_HOST })

async function fetch_verse(reference: Reference) {
	const source = await sources_client.get_source(reference)
	return source?.parsed_semantic_encoding ?? null
}

// Where to go to make the example from a different use of the concept, for a verse that uses it more than once
function build_word_choices({ url, word_indexes }: { url: URL; word_indexes: number[] }) {
	if (word_indexes.length < 2) return []

	return word_indexes.map(entity => {
		const choice = new URL(url)
		choice.searchParams.set('entity', String(entity))
		return { entity, href: choice.pathname + choice.search }
	})
}

// Saving goes through the same update that the concept form uses, so a user without
// UPDATE_CONCEPT records a suggestion instead of an applied change.
export async function load({ url, locals }: Parameters<PageServerLoad>[0]) {
	const db = locals.db_ontology
	const concept_key = get_concept_from_search_params(url.searchParams)

	const concept_data = await get_concept_for_update({ db, concept_key })
	if (!concept_data) {
		throw error(400, 'Specified concept does not exist.')
	}

	const source = await find_curated_example_source({
		search_params: url.searchParams,
		concept: concept_key,
		curated_examples: concept_data.curated_examples,
		fetch_verse,
	})

	return {
		concept_data,
		pending_changes: await get_pending_changes_for_concept({ db, concept_key }),
		...source,
		word_choices: build_word_choices({ url, word_indexes: source.word_indexes }),
	}
}
