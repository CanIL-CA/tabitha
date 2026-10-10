import { create_http_client, type ClientOptions } from './http'
import { sanitize_input_whitespace } from './text'
import type {
	SourceResult,
	SourceStatus,
	SourceEncodedResult,
	SourceSimpleJsonResult,
	Reference,
	PrimaryIdReference,
	SecondaryIdReference,
	SecondaryId,
	TertiaryId,
	SourceStatusResult,
	PrimaryIdSourceStatusResult,
	AnalysisResult,
} from '@tabitha/types'

export type SourcesClient = ReturnType<typeof create_sources_client>
export type SourcesClientOptions = ClientOptions

/**
 * Creates a typed HTTP client for communicating with the Sources service (`apps/sources`).
 *
 * @example
 * ```typescript
 * import { create_sources_client } from '@tabitha/api-client'
 *
 * const sources = create_sources_client({
 *   base_url: PUBLIC_SOURCES_API_HOST,
 *   cache: true, // Enables transparent Edge CDN caching on GET requests
 * })
 *
 * const verse = await sources.get_source({ type: 'Bible', id_primary: 'Genesis', id_secondary: '1', id_tertiary: '1' })
 * const status = await sources.get_book_status({ type: 'Bible', id_primary: 'Genesis' })
 * ```
 */
export function create_sources_client(options: SourcesClientOptions) {
	const http = create_http_client(options)

	return {
		/**
		 * Retrieve raw source data for a specific Bible verse.
		 */
		async get_source(ref: Reference): Promise<SourceResult | null> {
			return http.get<SourceResult>(`/${ref.type}/${ref.id_primary}/${ref.id_secondary}/${ref.id_tertiary}`)
		},

		/**
		 * Retrieve simplified JSON encoding for a verse, optionally including glosses.
		 */
		async get_simplified_json({ ref, include_glosses } : { ref: Reference, include_glosses?: boolean }): Promise<SourceSimpleJsonResult | null> {
			const query = include_glosses ? '?glosses=true' : ''
			return http.get<SourceSimpleJsonResult>(`/${ref.type}/${ref.id_primary}/${ref.id_secondary}/${ref.id_tertiary}/simple-json${query}`)
		},

		/**
		 * Retrieve the number of chapters present in a book.
		 */
		async get_book_chapters_count(ref: PrimaryIdReference): Promise<number | null> {
			const entries = await http.get<SecondaryId[]>(`/${ref.type}/${ref.id_primary}`)
			if (!entries || entries.length === 0) return null
			return Math.max(...entries.map(e => parseInt(e.id_secondary, 10)))
		},

		/**
		 * Retrieve the number of verses present in a chapter.
		 */
		async get_chapter_verses_count(ref: SecondaryIdReference): Promise<number | null> {
			const entries = await http.get<TertiaryId[]>(`/${ref.type}/${ref.id_primary}/${ref.id_secondary}`)
			if (!entries || entries.length === 0) return null
			return Math.max(...entries.map(e => parseInt(e.id_tertiary, 10)))
		},

		/**
		 * Look up the translation status of a specific verse reference.
		 */
		async get_verse_status(ref: Reference): Promise<SourceStatus | null> {
			const data = await http.post<SourceStatusResult[]>('/lookup/status', [ref])
			return data?.[0]?.status ?? null
		},

		/**
		 * Look up the translation status of multiple verse references at once.
		 */
		async get_verse_statuses(refs: Reference[]): Promise<SourceStatusResult[] | null> {
			return await http.post<SourceStatusResult[]>('/lookup/status', refs)
		},

		/**
		 * Look up whether each of multiple verse references actually holds a semantic encoding.
		 *
		 * Deliberately a separate call from `get_verse_statuses`, not an extra field on it:
		 * `status` and the presence of an encoding come from two migrations that never consult
		 * each other, so status is not a reliable stand-in for this question. See `/lookup/encoded`
		 * in the Sources README.
		 */
		async get_verse_encoding_availability(refs: Reference[]): Promise<SourceEncodedResult[] | null> {
			return await http.post<SourceEncodedResult[]>('/lookup/encoded', refs)
		},

		/**
		 * Look up the translation status of an entire book (e.g. 'Genesis').
		 */
		async get_book_status(ref: PrimaryIdReference): Promise<SourceStatus | null> {
			const data = await http.get<PrimaryIdSourceStatusResult>(`/lookup/status/${ref.type}/${ref.id_primary}`)
			return data?.status ?? null
		},

		/**
		 * Look up the translation status of every book of a given type.
		 */
		async get_all_book_statuses(type: string): Promise<PrimaryIdSourceStatusResult[]> {
			return await http.get<PrimaryIdSourceStatusResult[]>(`/lookup/status/${type}`) ?? []
		},

		/**
		 * Parse phase 1 text into source entities.
		 */
		async analyze_text(text: string): Promise<AnalysisResult | null> {
			return await http.get<AnalysisResult>(`/analyze?${new URLSearchParams({ text: sanitize_input_whitespace(text) })}`)
		},
	}
}
