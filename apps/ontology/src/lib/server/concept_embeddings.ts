import { AiResponseError, create_embedding_client, EMBEDDING_MODEL, format_embedding_input, type EmbeddingClient } from '@tabitha/ai'
import type { VectorizeMatches, VectorizeQueryOptions, VectorizeVector, VectorizeVectorMetadata } from '@cloudflare/workers-types'
import type { Concept } from '#lib/types.js'

// Vectorize documents a 1000-vector cap per upsert through a Worker binding; embedding (one
// gateway call per concept) is the slow part, so progress is written in smaller chunks -- a
// failure partway through a backfill keeps everything already upserted.
const SYNC_CHUNK_SIZE = 100
// Cloudflare doesn't document a getByIds cap, so reads stay conservative.
const GET_BY_IDS_CHUNK_SIZE = 20
// deleteByIds rejects more than 100 IDs per call (VECTOR_DELETE_ERROR 40007), well below the upsert cap.
const DELETE_CHUNK_SIZE = 100
// A Worker invocation can have at most six connections waiting at once, shared with D1 and Vectorize.
const EMBEDDING_CONCURRENCY = 4
// Vectorize's documented maximum vector ID length.
const MAX_VECTOR_ID_BYTES = 64
const MIN_SELF_SUFFICIENT_GLOSS_WORDS = 3
const MAX_EXAMPLE_SENTENCES = 2

const NOT_SEARCHABLE: ((concept: Concept) => boolean)[] = [
	// whole numbers add noise, but decimals stay so things like 'tenth' can relate to '.1'
	c => c.gloss.includes('number') && /^\d/.test(c.stem),
	// proper names
	c => c.gloss.startsWith('(proper name)'),
	// dates and times other than '12PM', so it can relate to 'noon'
	c => /\d(?:BC|AD|PM|AM)$/.test(c.stem) && c.stem !== '12PM',
	// concepts that are going to be deleted
	c => c.gloss.includes('DELETE'),
	// blank how-to rows and punctuation marks, which have no meaning to search for
	c => !/[\p{L}\p{N}]/u.test(c.stem),
]

/**
 * Just the index operations used here. `wrangler types` still types every Vectorize binding as the
 * legacy beta `VectorizeIndex`, while the runtime object for a current index is `Vectorize`; their
 * mutation results differ, so neither is assignable to the other, but both satisfy this.
 */
export type ConceptIndex = {
	query(vector: number[], options: VectorizeQueryOptions): Promise<VectorizeMatches>
	upsert(vectors: VectorizeVector[]): Promise<unknown>
	getByIds(ids: string[]): Promise<VectorizeVector[]>
	deleteByIds(ids: string[]): Promise<unknown>
}

/**
 * Plain strings rather than ConceptKey: read back out of untyped vector metadata, it's only ever
 * bound into a SQL lookup, where the database itself is the check.
 */
export type ConceptLookupKey = {
	readonly stem: string
	readonly sense: string
	readonly part_of_speech: string
}

export type ConceptDocument = {
	readonly key: string
	readonly concept: ConceptLookupKey
	readonly title: string
	readonly text: string
}

/**
 * The same four values whether they come from SvelteKit's `$env/dynamic/private` (semantic search)
 * or the Worker's own `platform.env` (the scheduled sync, which reads its bindings from there too).
 */
export type GatewayEnv = {
	readonly CLOUDFLARE_ACCOUNT_ID?: string
	readonly AI_GATEWAY_TOKEN?: string
	readonly GEMINI_PROJECT_ID?: string
	readonly GEMINI_LOCATION?: string
}

type SyncConceptEmbeddingsOptions = {
	readonly concepts: Concept[]
	readonly index: ConceptIndex
	readonly embedder: EmbeddingClient
}

type SyncSummary = {
	readonly embedded: number
	readonly unchanged: number
	readonly failed: number
}

export function create_concept_embedder(gateway_env: GatewayEnv): EmbeddingClient {
	return create_embedding_client({
		app: 'ontology',
		feature: 'semantic-search',
		gateway: {
			account_id: gateway_env.CLOUDFLARE_ACCOUNT_ID ?? '',
			token: gateway_env.AI_GATEWAY_TOKEN ?? '',
			project: gateway_env.GEMINI_PROJECT_ID ?? '',
			location: gateway_env.GEMINI_LOCATION ?? '',
		},
	})
}

export function concept_key({ stem, sense, part_of_speech }: ConceptLookupKey): string {
	return `${stem}-${sense}-${part_of_speech}`
}

export function is_searchable(concept: Concept): boolean {
	return !NOT_SEARCHABLE.some(is_excluded => is_excluded(concept))
}

export function to_concept_document(concept: Concept): ConceptDocument {
	return {
		key: concept_key(concept),
		concept: { stem: concept.stem, sense: concept.sense, part_of_speech: concept.part_of_speech },
		title: concept.stem,
		text: describe_meaning(concept),
	}
}

/**
 * Concepts not yet in the ontology have no real gloss (just a status message), so their first
 * how-to hint stands in for one. A real gloss drops its parenthesized classifiers, e.g.
 * "(proper name)", which say what kind of entry it is rather than what it means.
 */
function describe_meaning(concept: Concept): string {
	if (concept.status === 'in ontology') return describe_gloss(concept)

	const hint = concept.how_to_hints[0]
	if (!hint) return ''

	return [hint.structure, hint.pairing, hint.explication].map(field => field.trim()).filter(Boolean).join(' - ')
}

/**
 * An empty or very short gloss ("the color", "large") leaves the embedding little to go on
 * besides the stem itself, so curated example sentences fill in how the concept is used.
 */
function describe_gloss(concept: Concept): string {
	const gloss = concept.gloss.replaceAll(/\(.+?\)/g, '').trim()
	if (count_words(gloss) >= MIN_SELF_SUFFICIENT_GLOSS_WORDS) return gloss

	const example_sentences = concept.curated_examples
		.map(example => example.sentence.trim())
		.filter(Boolean)
		.slice(0, MAX_EXAMPLE_SENTENCES)
		.join(' ')

	return [gloss, example_sentences].filter(Boolean).join(': ')
}

function count_words(text: string): number {
	return text.split(/\s+/).filter(Boolean).length
}

/**
 * Hashes exactly what gets embedded (model included), so a changed gloss, hint, input format, or
 * model all trigger a re-embed, and nothing else does.
 */
export async function hash_document(document: ConceptDocument): Promise<string> {
	const embedded_text = format_embedding_input({ purpose: 'document', title: document.title, text: document.text })
	const bytes = new TextEncoder().encode(`${EMBEDDING_MODEL}\n${embedded_text}`)
	const digest = await crypto.subtle.digest('SHA-256', bytes)
	return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * Brings the index in line with the current concepts: embeds only concepts whose text hash
 * differs from the one stored on their vector, and removes vectors for concepts that are no
 * longer searchable. The hash lives in each vector's own metadata, so the index is the only
 * state -- nothing extra is stored in D1.
 */
export async function sync_concept_embeddings({ concepts, index, embedder }: SyncConceptEmbeddingsOptions): Promise<SyncSummary> {
	const documents = concepts.filter(is_searchable).map(to_concept_document).filter(has_valid_id)
	const hashes = await Promise.all(documents.map(hash_document))
	const stored_hashes = await read_stored_hashes({ index, ids: documents.map(document => document.key) })

	const stale = documents
		.map((document, i) => ({ document, text_hash: hashes[i] }))
		.filter(({ document, text_hash }) => stored_hashes.get(document.key) !== text_hash)

	let failed = 0
	for (const chunk of chunked({ items: stale, size: SYNC_CHUNK_SIZE })) {
		const vectors = await map_with_concurrency({ items: chunk, concurrency: EMBEDDING_CONCURRENCY, map: embed_document })
		const embedded_vectors = vectors.filter((vector): vector is VectorizeVector => vector !== null)
		failed += vectors.length - embedded_vectors.length

		if (embedded_vectors.length) await index.upsert(embedded_vectors)
	}

	// Deleting an ID that was never indexed is a no-op, so this clears concepts that became
	// unsearchable (e.g. newly marked DELETE) without first reading which ones are indexed.
	const unsearchable_ids = concepts.filter(concept => !is_searchable(concept)).map(concept_key).filter(fits_vector_id)
	for (const ids of chunked({ items: unsearchable_ids, size: DELETE_CHUNK_SIZE })) {
		await index.deleteByIds(ids)
	}

	return {
		embedded: stale.length - failed,
		unchanged: documents.length - stale.length,
		failed,
	}

	async function embed_document({ document, text_hash }: { document: ConceptDocument, text_hash: string }): Promise<VectorizeVector | null> {
		try {
			const values = await embedder.embed_text({ purpose: 'document', title: document.title, text: document.text })
			return { id: document.key, values, metadata: { text_hash, ...document.concept } }
		} catch (error) {
			// Left stale, so the next scheduled sync retries it.
			if (error instanceof AiResponseError) return null
			throw error
		}
	}
}

async function read_stored_hashes({ index, ids }: { index: ConceptIndex, ids: string[] }): Promise<Map<string, string>> {
	const stored = new Map<string, string>()

	for (const chunk of chunked({ items: ids, size: GET_BY_IDS_CHUNK_SIZE })) {
		for (const vector of await index.getByIds(chunk)) {
			const text_hash = vector.metadata?.text_hash
			if (typeof text_hash === 'string') stored.set(vector.id, text_hash)
		}
	}

	return stored
}

function has_valid_id(document: ConceptDocument): boolean {
	if (fits_vector_id(document.key)) return true

	console.warn(`ontology: concept key "${document.key}" is longer than Vectorize's ${MAX_VECTOR_ID_BYTES}-byte ID limit and won't be searchable`)
	return false
}

function fits_vector_id(id: string): boolean {
	return new TextEncoder().encode(id).length <= MAX_VECTOR_ID_BYTES
}

function chunked<T>({ items, size }: { items: T[], size: number }): T[][] {
	return Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size))
}

type MapWithConcurrencyOptions<T, R> = {
	readonly items: T[]
	readonly concurrency: number
	readonly map: (item: T) => Promise<R>
}

async function map_with_concurrency<T, R>({ items, concurrency, map }: MapWithConcurrencyOptions<T, R>): Promise<R[]> {
	const results: R[] = new Array(items.length)
	let next_index = 0

	async function work() {
		while (next_index < items.length) {
			const i = next_index++
			results[i] = await map(items[i])
		}
	}

	await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, work))
	return results
}

/**
 * Recovers a concept's key fields from its vector's metadata. The vector ID can't be split back
 * apart reliably -- stems contain hyphens (e.g. "sound-like") and how-to-only senses can be empty.
 */
export function read_concept_key(metadata: Record<string, VectorizeVectorMetadata> | undefined): ConceptLookupKey | null {
	const { stem, sense, part_of_speech } = metadata ?? {}
	if (typeof stem !== 'string' || typeof sense !== 'string' || typeof part_of_speech !== 'string') return null

	return { stem, sense, part_of_speech }
}
