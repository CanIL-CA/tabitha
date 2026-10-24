import { describe, expect, test, vi } from 'vitest'
import {
	cached_json,
	create_editor_client,
	create_http_client,
	create_ontology_client,
	create_sources_client,
	create_targets_client,
	ONE_DAY_IN_SECONDS,
} from './index'

const EDITOR_URL = 'http://localhost:1337'
const TARGETS_URL = 'http://localhost:1382'
const SOURCES_URL = 'http://localhost:1947'
const ONTOLOGY_URL = 'http://localhost:3056'

describe('@tabitha/api-client', () => {
	describe('cached_json', () => {
		test('returns a standard Response object with JSON body', async () => {
			const data = { message: 'hello', count: 42 }
			const response = cached_json({ data })

			expect(response).toBeInstanceOf(Response)
			expect(response.status).toBe(200)
			expect(response.headers.get('content-type')).toBe('application/json')

			const body = await response.json()
			expect(body).toEqual(data)
		})

		test('sets default SWR Cache-Control header (24 hours = 86400s edge, 0s browser)', () => {
			const response = cached_json({ data: { ok: true } })
			expect(response.headers.get('cache-control')).toBe(
				`public, max-age=0, s-maxage=${ONE_DAY_IN_SECONDS}, stale-while-revalidate=${ONE_DAY_IN_SECONDS}, must-revalidate`,
			)
		})

		test('allows custom s_maxage duration via number', () => {
			const response = cached_json({ data: { ok: true }, options: 3600 })
			expect(response.headers.get('cache-control')).toBe(
				`public, max-age=0, s-maxage=3600, stale-while-revalidate=${ONE_DAY_IN_SECONDS}, must-revalidate`,
			)
		})

		test('allows custom options object', () => {
			const response = cached_json({
				data: { ok: true },
				options: {
					browser_max_age_seconds: 60,
					s_maxage_seconds: 7200,
					stale_while_revalidate_seconds: 1800,
				},
			})
			expect(response.headers.get('cache-control')).toBe(
				'public, max-age=60, s-maxage=7200, stale-while-revalidate=1800, must-revalidate',
			)
		})
	})

	describe('create_http_client', () => {
		test('automatically normalizes trailing slashes and prepends base url', async () => {
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ status: 'ok' }),
			})
			const http = create_http_client({
				base_url: `${TARGETS_URL}/`,
				fetch: mock_fetch as unknown as typeof fetch,
			})

			await http.get('search')
			expect(mock_fetch).toHaveBeenCalledWith(`${TARGETS_URL}/search`)
		})

		test('supports declarative cache: true (appends ?v=1)', async () => {
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ status: 'ok' }),
			})
			const http = create_http_client({
				base_url: TARGETS_URL,
				fetch: mock_fetch as unknown as typeof fetch,
				cache: true,
			})

			await http.get('/search?q=love')
			expect(mock_fetch).toHaveBeenCalledWith(`${TARGETS_URL}/search?q=love&v=1`)
		})

		test('does not append version query param when cache is false or omitted', async () => {
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ status: 'ok' }),
			})
			const http = create_http_client({
				base_url: TARGETS_URL,
				fetch: mock_fetch as unknown as typeof fetch,
			})

			await http.get('/search?q=love')
			expect(mock_fetch).toHaveBeenCalledWith(`${TARGETS_URL}/search?q=love`)
		})

		describe('get params', () => {
			function get_requested_url({ params, path = '/search', cache = false }: {
				params: Record<string, string | undefined>
				path?: string
				cache?: boolean
			}) {
				const mock_fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
				const http = create_http_client({
					base_url: TARGETS_URL,
					fetch: mock_fetch as unknown as typeof fetch,
					cache,
				})
				return http.get(path, { params }).then(() => new URL(mock_fetch.mock.calls[0][0]))
			}

			test('sends values with reserved characters intact', async () => {
				const { searchParams } = await get_requested_url({ params: { q: 'a&b=c+d#e f' } })
				expect(searchParams.get('q')).toBe('a&b=c+d#e f')
			})

			test('leaves out undefined values but keeps empty strings', async () => {
				const { searchParams } = await get_requested_url({ params: { q: 'love', scope: undefined, category: '' } })
				expect([...searchParams.keys()].sort()).toEqual(['category', 'q'])
			})

			test('adds no query string when every value is undefined', async () => {
				const { search } = await get_requested_url({ params: { q: undefined } })
				expect(search).toBe('')
			})

			test('keeps a query already in the path', async () => {
				const { searchParams } = await get_requested_url({ path: '/search?q=love', params: { scope: 'Bible' } })
				expect(Object.fromEntries(searchParams)).toEqual({ q: 'love', scope: 'Bible' })
			})

			test('adds the cache version alongside params when cache is true', async () => {
				const { searchParams } = await get_requested_url({ params: { q: 'love' }, cache: true })
				expect(Object.fromEntries(searchParams)).toEqual({ q: 'love', v: '1' })
			})

			test('does not pass params on to fetch as a request option', async () => {
				const mock_fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
				const http = create_http_client({ base_url: TARGETS_URL, fetch: mock_fetch as unknown as typeof fetch })

				await http.get('/search', { params: { q: 'love' }, headers: { Accept: 'application/json' } })

				expect(mock_fetch.mock.calls[0][1]).toEqual({ headers: { Accept: 'application/json' }, method: 'GET' })
			})
		})

		test('does not append version query param to POST requests', async () => {
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ status: 'ok' }),
			})
			const http = create_http_client({
				base_url: TARGETS_URL,
				fetch: mock_fetch as unknown as typeof fetch,
				cache: true,
			})

			await http.post('/check', { text: 'hello' })
			expect(mock_fetch).toHaveBeenCalledWith(`${TARGETS_URL}/check`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: 'hello' }),
			})
		})

		test('get parses JSON on ok response and returns null on error', async () => {
			const mock_fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ id: 1 }),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 404,
				})

			const http = create_http_client({
				base_url: TARGETS_URL,
				fetch: mock_fetch as unknown as typeof fetch,
			})

			const ok_result = await http.get<{ id: number }>('/item')
			expect(ok_result).toEqual({ id: 1 })

			const error_result = await http.get<{ id: number }>('/not-found')
			expect(error_result).toBeNull()
		})

		test('logs a warning with the status and url when a request fails', async () => {
			const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
			try {
				const mock_fetch = vi.fn().mockResolvedValue({
					ok: false,
					status: 503,
					statusText: 'Service Unavailable',
					url: `${TARGETS_URL}/item`,
				})

				const http = create_http_client({
					base_url: TARGETS_URL,
					fetch: mock_fetch as unknown as typeof fetch,
				})

				await http.get('/item')
				const [message] = warn.mock.calls[0]
				expect(message).toContain('503')
				expect(message).toContain(`${TARGETS_URL}/item`)
			} finally {
				warn.mockRestore()
			}
		})

		test('get retries on 429 honoring Retry-After and returns the eventual success', async () => {
			vi.useFakeTimers()
			try {
				const mock_fetch = vi
					.fn()
					.mockResolvedValueOnce({
						ok: false,
						status: 429,
						headers: new Headers({ 'retry-after': '1' }),
					})
					.mockResolvedValueOnce({
						ok: true,
						json: async () => ({ id: 1 }),
					})

				const http = create_http_client({
					base_url: TARGETS_URL,
					fetch: mock_fetch as unknown as typeof fetch,
				})

				const result_promise = http.get<{ id: number }>('/item')
				await vi.advanceTimersByTimeAsync(1000)
				const result = await result_promise

				expect(result).toEqual({ id: 1 })
				expect(mock_fetch).toHaveBeenCalledTimes(2)
			} finally {
				vi.useRealTimers()
			}
		})

		test('get gives up and returns null after repeated 429s', async () => {
			vi.useFakeTimers()
			try {
				const mock_fetch = vi.fn().mockResolvedValue({
					ok: false,
					status: 429,
					headers: new Headers({ 'retry-after': '0' }),
				})

				const http = create_http_client({
					base_url: TARGETS_URL,
					fetch: mock_fetch as unknown as typeof fetch,
				})

				const result_promise = http.get<{ id: number }>('/item')
				await vi.runAllTimersAsync()
				const result = await result_promise

				expect(result).toBeNull()
				// initial attempt + MAX_RATE_LIMIT_RETRIES retries
				expect(mock_fetch).toHaveBeenCalledTimes(4)
			} finally {
				vi.useRealTimers()
			}
		})

		test('post parses JSON on ok response and returns null on error', async () => {
			const mock_fetch = vi
				.fn()
				.mockResolvedValueOnce({
					ok: true,
					json: async () => ({ status: 'created' }),
				})
				.mockResolvedValueOnce({
					ok: false,
					status: 500,
				})

			const http = create_http_client({
				base_url: TARGETS_URL,
				fetch: mock_fetch as unknown as typeof fetch,
			})

			const ok_result = await http.post<{ status: string }>('/item', { name: 'test' })
			expect(ok_result).toEqual({ status: 'created' })

			const error_result = await http.post<{ status: string }>('/item', { name: 'test' })
			expect(error_result).toBeNull()
		})

		test('returns text for text/plain or text/csv responses', async () => {
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: true,
				headers: new Headers({ 'content-type': 'text/plain; charset=utf-8' }),
				text: async () => 'sample,plain,text',
			})

			const http = create_http_client({
				base_url: TARGETS_URL,
				fetch: mock_fetch as unknown as typeof fetch,
			})

			const result = await http.get<string>('/export.csv')
			expect(result).toBe('sample,plain,text')
		})

		test('returns readable stream for text/event-stream responses', async () => {
			const mock_stream = {} as ReadableStream
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: true,
				headers: new Headers({ 'content-type': 'text/event-stream' }),
				body: mock_stream,
			})

			const http = create_http_client({
				base_url: TARGETS_URL,
				fetch: mock_fetch as unknown as typeof fetch,
			})

			const result = await http.get<ReadableStream>('/events')
			expect(result).toBe(mock_stream)
		})

		test('returns ArrayBuffer for binary/octet-stream responses', async () => {
			const mock_buffer = new ArrayBuffer(8)
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: true,
				headers: new Headers({ 'content-type': 'application/octet-stream' }),
				arrayBuffer: async () => mock_buffer,
			})

			const http = create_http_client({
				base_url: TARGETS_URL,
				fetch: mock_fetch as unknown as typeof fetch,
			})

			const result = await http.get<ArrayBuffer>('/data.bin')
			expect(result).toBe(mock_buffer)
		})
	})

	describe('create_editor_client', () => {
		test('calls /check endpoint and returns parsed json on 200', async () => {
			const mock_response = { status: 'ok', tokens: [], back_translation: 'Paul writes.' }
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mock_response,
			})

			const client = create_editor_client({
				base_url: `${EDITOR_URL}/`,
				fetch: mock_fetch as unknown as typeof fetch,
			})

			const result = await client.check_text({ text: 'Paul writes-A.' })
			expect(mock_fetch).toHaveBeenCalledWith(`${EDITOR_URL}/check?text=Paul+writes-A.`)
			expect(result).toEqual(mock_response)
		})

		test('returns null when response is not ok', async () => {
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 500,
			})

			const client = create_editor_client({
				base_url: EDITOR_URL,
				fetch: mock_fetch as unknown as typeof fetch,
			})

			const result = await client.check_text({ text: 'invalid' })
			expect(result).toBeNull()
		})

		test('check_text replaces line breaks with spaces and appends auto_fix when requested', async () => {
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => ({ status: 'ok', tokens: [], back_translation: '' }),
			})

			const client = create_editor_client({
				base_url: EDITOR_URL,
				fetch: mock_fetch as unknown as typeof fetch,
			})

			await client.check_text({ text: 'Paul writes-A.\nJohn reads-A.', auto_fix: true })
			expect(mock_fetch).toHaveBeenCalledWith(`${EDITOR_URL}/check?text=Paul+writes-A.+John+reads-A.&auto_fix=on`)
		})

		test('analyze_text replaces line breaks with spaces and queries /analyze', async () => {
			const mock_response = { source_entities: [], noun_list: [] }
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mock_response,
			})

			const client = create_editor_client({
				base_url: EDITOR_URL,
				fetch: mock_fetch as unknown as typeof fetch,
			})

			const result = await client.analyze_text('Paul writes-A.\nJohn reads-A.')
			const { pathname, searchParams } = new URL(mock_fetch.mock.calls[0][0])
			expect(pathname).toBe('/analyze')
			expect(searchParams.get('text')).toBe('Paul writes-A. John reads-A.')
			expect(result).toEqual(mock_response)
		})

		test('ai_assist_generate posts line-break-free text to /ai-assist/generate', async () => {
			const mock_response = { status: 'ok', phase_1: 'Paul writes-A.', notes: [], check: { status: 'ok', tokens: [], back_translation: '' } }
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mock_response,
			})

			const client = create_editor_client({
				base_url: EDITOR_URL,
				fetch: mock_fetch as unknown as typeof fetch,
			})

			const result = await client.ai_assist_generate('Paul wrote\na letter.')
			expect(mock_fetch).toHaveBeenCalledWith(`${EDITOR_URL}/ai-assist/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: 'Paul wrote a letter.' }),
			})
			expect(result).toEqual(mock_response)
		})
	})

	describe('create_ontology_client', () => {
		test('search_concepts formats query parameters correctly', async () => {
			const mock_results = [{ stem: 'write', sense: 'A', part_of_speech: 'Verb' }]
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mock_results,
			})

			const client = create_ontology_client({
				base_url: ONTOLOGY_URL,
				fetch: mock_fetch as unknown as typeof fetch,
			})

			const results = await client.search_concepts({ q: 'write', category: 'Verb' })
			expect(mock_fetch).toHaveBeenCalledWith(`${ONTOLOGY_URL}/search?q=write&category=Verb`)
			expect(results).toEqual(mock_results)
		})

		test('appends version parameter when cache is enabled', async () => {
			const mock_results = [{ stem: 'write', sense: 'A', part_of_speech: 'Verb' }]
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mock_results,
			})

			const client = create_ontology_client({
				base_url: ONTOLOGY_URL,
				fetch: mock_fetch as unknown as typeof fetch,
				cache: true,
			})

			await client.search_concepts({ q: 'write' })
			expect(mock_fetch).toHaveBeenCalledWith(`${ONTOLOGY_URL}/search?q=write&v=1`)
		})

		test('get_concept returns matching concept from search', async () => {
			const mock_results = [
				{ stem: 'write', sense: 'A', part_of_speech: 'Verb' },
				{ stem: 'write', sense: 'B', part_of_speech: 'Verb' },
			]
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mock_results,
			})

			const client = create_ontology_client({
				base_url: ONTOLOGY_URL,
				fetch: mock_fetch as unknown as typeof fetch,
			})

			const concept = await client.get_concept({ stem: 'write', sense: 'B', part_of_speech: 'Verb' })
			expect(concept?.sense).toBe('B')
		})

		test('get_examples queries examples endpoint with concept, part of speech, and source', async () => {
			const mock_examples = [{ reference: { type: 'Bible', id_primary: 'Genesis', id_secondary: '1', id_tertiary: '1' } }]
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mock_examples,
			})

			const client = create_ontology_client({
				base_url: ONTOLOGY_URL,
				fetch: mock_fetch as unknown as typeof fetch,
			})

			const examples = await client.get_examples({ concept: { stem: 'write', sense: 'A', part_of_speech: 'Verb' }, source: 'Bible' })
			expect(mock_fetch).toHaveBeenCalledWith(`${ONTOLOGY_URL}/examples?concept=write-A&part_of_speech=Verb&source=Bible`)
			expect(examples).toEqual(mock_examples)
		})

		test('get_examples sends values with reserved characters intact', async () => {
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => [],
			})

			const client = create_ontology_client({
				base_url: ONTOLOGY_URL,
				fetch: mock_fetch as unknown as typeof fetch,
			})

			await client.get_examples({ concept: { stem: 'a&b+c#d', sense: 'A', part_of_speech: 'Verb' }, source: 'My Bible' })

			const { searchParams } = new URL(mock_fetch.mock.calls[0][0])
			expect(searchParams.get('concept')).toBe('a&b+c#d-A')
			expect(searchParams.get('part_of_speech')).toBe('Verb')
			expect(searchParams.get('source')).toBe('My Bible')
		})
	})

	describe('create_sources_client', () => {
		test('get_source queries correct REST path', async () => {
			const mock_data = { id: 'GEN.1.1' }
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mock_data,
			})

			const client = create_sources_client({
				base_url: SOURCES_URL,
				fetch: mock_fetch as unknown as typeof fetch,
			})

			const data = await client.get_source({ type: 'Bible', id_primary: 'Genesis', id_secondary: '1', id_tertiary: '1' })
			expect(mock_fetch).toHaveBeenCalledWith(`${SOURCES_URL}/Bible/Genesis/1/1`)
			expect(data).toEqual(mock_data)
		})

		test('appends version parameter when cache is enabled', async () => {
			const mock_data = { id: 'GEN.1.1' }
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mock_data,
			})

			const client = create_sources_client({
				base_url: SOURCES_URL,
				fetch: mock_fetch as unknown as typeof fetch,
				cache: true,
			})

			await client.get_source({ type: 'Bible', id_primary: 'Genesis', id_secondary: '1', id_tertiary: '1' })
			expect(mock_fetch).toHaveBeenCalledWith(`${SOURCES_URL}/Bible/Genesis/1/1?v=1`)
		})

		test('get_book_status queries lookup status endpoint', async () => {
			const mock_data = { status: 'Ready to Translate' }
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mock_data,
			})

			const client = create_sources_client({
				base_url: SOURCES_URL,
				fetch: mock_fetch as unknown as typeof fetch,
			})

			const status = await client.get_book_status({ type: 'Bible', id_primary: 'Genesis' })
			expect(mock_fetch).toHaveBeenCalledWith(`${SOURCES_URL}/lookup/status/Bible/Genesis`)
			expect(status).toBe('Ready to Translate')
		})

		test('get_all_book_statuses queries lookup status endpoint for a type', async () => {
			const mock_data = [
				{ reference: { id_primary: 'GEN' }, status: 'Ready to Translate' },
				{ reference: { id_primary: 'EXO' }, status: 'Not Started' },
			]
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mock_data,
			})

			const client = create_sources_client({
				base_url: 'http://localhost:8789',
				fetch: mock_fetch as unknown as typeof fetch,
			})

			const statuses = await client.get_all_book_statuses('Bible')
			expect(mock_fetch).toHaveBeenCalledWith('http://localhost:8789/lookup/status/Bible')
			expect(statuses).toEqual(mock_data)
		})

		test('analyze_text replaces line breaks with spaces and queries /analyze', async () => {
			const mock_response = { source_entities: [] }
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mock_response,
			})

			const client = create_sources_client({
				base_url: SOURCES_URL,
				fetch: mock_fetch as unknown as typeof fetch,
			})

			const result = await client.analyze_text('Paul writes-A.\nJohn reads-A.')
			expect(mock_fetch).toHaveBeenCalledWith(`${SOURCES_URL}/analyze?text=Paul+writes-A.+John+reads-A.`)
			expect(result).toEqual(mock_response)
		})
	})

	describe('create_targets_client', () => {
		test('get_target_text queries project verse path and selects preferred audience', async () => {
			const ref = { type: 'Bible', id_primary: 'Genesis', id_secondary: '1', id_tertiary: '1' }
			const mock_results = {
				reference: ref,
				texts: [
					{ audience: 'Children', text: 'In the beginning...' },
					{ audience: 'Unchurched Adults', text: 'In the beginning God created...' },
				],
			}
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mock_results,
			})

			const client = create_targets_client({
				base_url: TARGETS_URL,
				fetch: mock_fetch as unknown as typeof fetch,
			})

			const result = await client.get_target_text({ ref, project: 'English', preferred_audience: 'Unchurched Adults' })
			expect(mock_fetch).toHaveBeenCalledWith(`${TARGETS_URL}/English/Genesis/1/1`)
			expect(result?.text).toBe('In the beginning God created...')
		})

		test('appends version parameter when cache is enabled', async () => {
			const mock_features = { features: [] }
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mock_features,
			})

			const client = create_targets_client({
				base_url: TARGETS_URL,
				fetch: mock_fetch as unknown as typeof fetch,
				cache: true,
			})

			await client.lookup_features({ project: 'English', category: 'Noun' })
			expect(mock_fetch).toHaveBeenCalledWith(`${TARGETS_URL}/English/lookup/features?category=Noun&v=1`)
		})

		test('lookup_forms queries forms endpoint', async () => {
			const mock_forms = [{ stem: 'love', form: 'loved', form_name: 'past', category: 'Verb' }]
			const mock_fetch = vi.fn().mockResolvedValue({
				ok: true,
				json: async () => mock_forms,
			})

			const client = create_targets_client({
				base_url: TARGETS_URL,
				fetch: mock_fetch as unknown as typeof fetch,
			})

			const forms = await client.lookup_forms({ word: 'loved', project: 'English' })
			expect(mock_fetch).toHaveBeenCalledWith(`${TARGETS_URL}/English/lookup/forms?word=loved`)
			expect(forms).toEqual(mock_forms)
		})
	})
})
