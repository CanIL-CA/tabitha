import { PUBLIC_SOURCES_API_HOST } from '$env/static/public'
import { error } from '@sveltejs/kit'
import { cached_json, create_sources_client } from '@tabitha/api-client'
import { get_examples } from '#lib/server/ontology.js'
import type { RequestHandler } from './$types'
import type { ConceptExample, SourceStatus } from '@tabitha/types'

/**
 * In-memory Worker isolate cache for book statuses.
 *
 * Why this is here:
 * Resolving book statuses across all example references can require multiple sub-requests
 * to the Sources service. By caching resolved book statuses in isolate memory with a short TTL,
 * subsequent requests within the same Worker isolate return in sub-milliseconds without network hops.
 *
 * When a new deployment is published, Cloudflare recycles the Worker isolate, automatically
 * dropping this memory cache and fetching fresh data immediately.
 */
type CachedStatus = {
	status: SourceStatus
	cached_at: number
}

const ISOLATE_STATUS_CACHE_TTL_MS = 15 * 60 * 1000 // 15 minutes
const book_status_isolate_cache = new Map<string, CachedStatus>()
const sources_client = create_sources_client({ base_url: PUBLIC_SOURCES_API_HOST, cache: true })

export async function GET({ url: { searchParams }, locals: { db_ontology } }: Parameters<RequestHandler>[0]) {
	const concept = searchParams.get('concept') ?? error(400, 'Missing "concept" parameter')
	const part_of_speech = searchParams.get('part_of_speech') ?? error(400, 'Missing "part_of_speech" parameter')
	const source = searchParams.get('source') ?? ''

	const examples = await get_examples(db_ontology)(concept, part_of_speech, source)
	const examples_with_status = await fetch_statuses_by_book(examples)

	return cached_json({ data: examples_with_status })
}

async function fetch_statuses_by_book(examples: ConceptExample[]): Promise<ConceptExample[]> {
	const book_refs = [...new Set(examples.map(({ reference }) => reference.id_primary))]
	const now = Date.now()

	// Fetch the status for each book using isolate-level caching to avoid redundant sub-requests.
	const book_statuses: [string, SourceStatus][] = await Promise.all(
		book_refs.map(async (book): Promise<[string, SourceStatus]> => {
			const cached = book_status_isolate_cache.get(book)
			if (cached && now - cached.cached_at < ISOLATE_STATUS_CACHE_TTL_MS) {
				return [book, cached.status]
			}

			try {
				const status = await sources_client.get_book_status({ type: 'Bible', id_primary: book })
				const resolved_status = status ?? ('Ready to Translate' as SourceStatus)
				book_status_isolate_cache.set(book, { status: resolved_status, cached_at: now })
				return [book, resolved_status]
			} catch {
				return [book, 'Ready to Translate' as SourceStatus]
			}
		}),
	)

	const status_map = new Map<string, SourceStatus>(book_statuses)

	return examples.map(example => {
		const book_status = status_map.get(example.reference.id_primary) ?? 'Initial Analysis in Progress'
		return { ...example, book_status }
	})
}
