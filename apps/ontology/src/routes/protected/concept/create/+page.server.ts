import type { ConceptCreateData } from '#lib/types.js'

// Reaching this page only requires PROTECTED_ACCESS (enforced in hooks.server.ts for all /protected
// routes) -- ADD_CONCEPT is no longer required here, since a user without it can still submit a new
// concept, it just gets recorded as a suggestion instead of applied immediately (see add_change).
export async function load() {
	const concept_data: ConceptCreateData = {
		stem: '',
		sense: '',
		part_of_speech: 'Noun',
		level: '0',
		gloss: '',
		brief_gloss: '',
		categories: [],
		curated_examples: '',
	}
	return {
		concept_data,
	}
}
