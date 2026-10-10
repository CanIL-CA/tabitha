import { env } from '$env/dynamic/private'
import { check_input_safety, AiResponseError } from '@tabitha/ai'
import { concept_key, create_concept_embedder, read_concept_key, type ConceptIndex, type ConceptLookupKey } from './concept_embeddings'
import { get_concepts_by_keys } from './ontology'
import type { D1Database } from '@cloudflare/workers-types'
import type { Concept } from '#lib/types.js'

const ONE_WEEK_IN_SECONDS = 7 * 24 * 60 * 60

// The AI Gateway's prompt-injection guardrail is off gateway-wide (see @tabitha/ai's input_guard
// and ADR 0007), so this is a local, best-effort substitute scoped to the one piece of user text
// here: the search box query. A search term is normally a single word or short phrase, so the cap
// is tight -- no legitimate search needs more than this.
const MAX_SEARCH_TERM_LENGTH = 200

const MAX_RELATED_CONCEPTS = 10

type FindRelatedConceptsOptions = {
	readonly db: D1Database
	readonly index: ConceptIndex | undefined
	readonly search_term: string
}

/**
 * Embeds the search term and returns the concepts whose embedded glosses sit nearest to it, most
 * similar first. The concepts themselves were embedded ahead of time by the scheduled
 * sync_concept_embeddings (see ADR 0016).
 */
export async function find_related_concepts({ db, index, search_term }: FindRelatedConceptsOptions): Promise<Concept[]> {
	const safety_issue = check_input_safety({
		text: search_term,
		max_length: MAX_SEARCH_TERM_LENGTH,
		too_long_message: `Search term is too long (${search_term.length} characters, max ${MAX_SEARCH_TERM_LENGTH}).`,
		suspicious_message: 'Search term looks like it might contain instructions rather than a concept to search for.',
		log_label: 'ontology: semantic-search',
	})
	if (safety_issue) {
		// No related concepts is a normal, unremarkable outcome for a search feature -- fail soft,
		// same as a failed embedding or index query below.
		console.warn(`ontology: semantic-search rejected search term (${search_term.length} chars): ${safety_issue}`)
		return []
	}

	if (!index) return []

	const nearest_keys = await find_nearest_concept_keys({ index, search_term })
	const related_keys = nearest_keys
		// the concept that is exactly the search term already shows up in the plain stem results
		.filter(key => key.stem !== search_term)
		.slice(0, MAX_RELATED_CONCEPTS)

	const concepts = await get_concepts_by_keys({ db, keys: related_keys })
	const rank_by_key = new Map(related_keys.map((key, rank) => [concept_key(key), rank]))

	return concepts.toSorted((a, b) => (rank_by_key.get(concept_key(a)) ?? 0) - (rank_by_key.get(concept_key(b)) ?? 0))
}

async function find_nearest_concept_keys({ index, search_term }: { index: ConceptIndex, search_term: string }): Promise<ConceptLookupKey[]> {
	try {
		const vector = await create_concept_embedder(env).embed_text({
			purpose: 'query',
			text: search_term,
			// The gateway's shared, durable cache answers a repeated search term without calling Vertex.
			http_headers: { 'cf-aig-cache-ttl': String(ONE_WEEK_IN_SECONDS) },
		})

		// +1 leaves room for the exact-stem match, which is filtered out afterward.
		const { matches } = await index.query(vector, { topK: MAX_RELATED_CONCEPTS + 1, returnMetadata: 'all' })

		return matches
			.map(match => read_concept_key(match.metadata))
			.filter((key): key is ConceptLookupKey => key !== null)
	} catch (error) {
		// No related concepts is a normal, unremarkable outcome for a search feature -- fail soft.
		// That includes local dev and e2e, where Vectorize has no local simulation to query.
		if (!(error instanceof AiResponseError)) console.error('ontology: semantic-search index query failed', error)
		return []
	}
}
