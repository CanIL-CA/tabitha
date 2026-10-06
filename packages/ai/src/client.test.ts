import { beforeEach, describe, expect, test, vi } from 'vitest'
import { create_ai_client, create_embedding_client, EMBEDDING_DIMENSIONS, format_embedding_input } from './client'
import { AiResponseError } from './errors'
import type { AiGatewayConfig } from './types'

const fetch_mock = vi.fn()
vi.stubGlobal('fetch', fetch_mock)

const gateway: AiGatewayConfig = {
	account_id: 'acct-1',
	token: 'gw-token',
	project: 'my-project',
	location: 'us-central1',
}

function mock_response(text: string) {
	fetch_mock.mockResolvedValue({
		ok: true,
		json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
	})
}

describe('@tabitha/ai', () => {
	beforeEach(() => {
		fetch_mock.mockReset()
		vi.spyOn(console, 'error').mockImplementation(() => {})
	})

	describe('create_ai_client', () => {
		test('sends the request to the Vertex AI gateway route with the gateway auth and metadata headers', async () => {
			mock_response('{}')
			const ai = create_ai_client({ app: 'ontology', feature: 'semantic-search', gateway })

			await ai.generate_text({ contents: 'hi' })

			const [url, init] = fetch_mock.mock.calls[0]
			expect(url).toBe(
				'https://gateway.ai.cloudflare.com/v1/acct-1/tabitha/google-vertex-ai/v1beta1/projects/my-project/locations/us-central1/publishers/google/models/gemini-3.5-flash:generateContent',
			)
			expect(init).toEqual(expect.objectContaining({
				method: 'POST',
				headers: expect.objectContaining({
					'content-type': 'application/json',
					'cf-aig-authorization': 'Bearer gw-token',
					'cf-aig-metadata': JSON.stringify({ app: 'ontology', feature: 'semantic-search' }),
				}),
			}))
		})

		test('merges a per-call httpOptions.headers override in without forwarding it into generationConfig', async () => {
			mock_response('{}')
			const ai = create_ai_client({ app: 'ontology', feature: 'semantic-search', gateway })

			await ai.generate_text({
				contents: 'hi',
				config: { httpOptions: { headers: { 'cf-aig-cache-ttl': '604800' } } },
			})

			const [, init] = fetch_mock.mock.calls[0]
			expect(init.headers).toEqual(expect.objectContaining({ 'cf-aig-cache-ttl': '604800' }))
			const body = JSON.parse(init.body)
			expect(body.generationConfig).not.toHaveProperty('httpOptions')
		})

		test('throws AiResponseError with the status on a non-ok gateway response, and logs the body for Observability', async () => {
			fetch_mock.mockResolvedValue({ ok: false, status: 502, statusText: 'Bad Gateway', text: async () => 'bad gateway' })
			const ai = create_ai_client({ app: 'ontology', feature: 'semantic-search', gateway })

			await expect(ai.generate_text({ contents: 'hi' })).rejects.toThrow(AiResponseError)
			await expect(ai.generate_text({ contents: 'hi' })).rejects.toThrow('502')
			expect(console.error).toHaveBeenCalledWith(expect.stringContaining('bad gateway'))
		})

		test('throws AiResponseError on a network failure, without ever calling response.json/.text', async () => {
			fetch_mock.mockRejectedValue(new Error('fetch failed'))
			const ai = create_ai_client({ app: 'ontology', feature: 'semantic-search', gateway })

			await expect(ai.generate_text({ contents: 'hi' })).rejects.toThrow(AiResponseError)
			expect(console.error).toHaveBeenCalled()
		})

		test('gives every gateway request a timeout signal, so a hung call cannot stall its caller forever', async () => {
			mock_response('{}')
			const ai = create_ai_client({ app: 'copilot', feature: 'copilot', gateway })

			await ai.generate_text({ contents: 'hi' })

			const [, init] = fetch_mock.mock.calls[0]
			expect(init.signal).toBeInstanceOf(AbortSignal)
		})

		test('sends a per-attempt gateway timeout, so the gateway retries a slow provider response instead of waiting on it', async () => {
			mock_response('{}')
			const ai = create_ai_client({ app: 'copilot', feature: 'copilot', gateway })

			await ai.generate_text({ contents: 'hi' })

			const [, init] = fetch_mock.mock.calls[0]
			expect(init.headers).toEqual(expect.objectContaining({ 'cf-aig-request-timeout': '60000' }))
		})

		test('throws AiResponseError naming the timeout when the gateway request times out', async () => {
			fetch_mock.mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
			const ai = create_ai_client({ app: 'copilot', feature: 'copilot', gateway })

			const result = ai.generate_text({ contents: 'hi' })

			await expect(result).rejects.toThrow(AiResponseError)
			await expect(result).rejects.toThrow('timed out')
		})

		test('throws AiResponseError naming the timeout when the response body stalls past the timeout', async () => {
			fetch_mock.mockResolvedValue({
				ok: true,
				json: async () => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError') },
			})
			const ai = create_ai_client({ app: 'copilot', feature: 'copilot', gateway })

			const result = ai.generate_text({ contents: 'hi' })

			await expect(result).rejects.toThrow(AiResponseError)
			await expect(result).rejects.toThrow('timed out')
		})
	})

	describe('generate_json', () => {
		test('parses the response text as JSON', async () => {
			mock_response('{"hello":"world"}')
			const ai = create_ai_client({ app: 'ontology', feature: 'semantic-search', gateway })

			const result = await ai.generate_json<{ hello: string }>({
				contents: { q: 1 },
				schema: { type: 'object' },
			})

			expect(result).toEqual({ hello: 'world' })
		})

		test('throws AiResponseError on an empty response', async () => {
			mock_response('')
			const ai = create_ai_client({ app: 'ontology', feature: 'semantic-search', gateway })

			await expect(ai.generate_json({ contents: {}, schema: {} })).rejects.toThrow(AiResponseError)
		})

		test('throws AiResponseError on unparseable JSON', async () => {
			mock_response('not json')
			const ai = create_ai_client({ app: 'ontology', feature: 'semantic-search', gateway })

			await expect(ai.generate_json({ contents: {}, schema: {} })).rejects.toThrow(AiResponseError)
		})

		test('layers package defaults, client defaults, and per-call overrides', async () => {
			mock_response('{}')
			const ai = create_ai_client({
				app: 'copilot',
				feature: 'brief',
				gateway,
				defaults: { topP: 0.9 },
			})

			await ai.generate_json({ contents: {}, schema: { type: 'object' }, config: { temperature: 0.5 } })

			const [, init] = fetch_mock.mock.calls[0]
			const body = JSON.parse(init.body)
			expect(body.generationConfig).toEqual(expect.objectContaining({
				seed: 42,
				topP: 0.9,
				temperature: 0.5,
				frequencyPenalty: 0.0,
				presencePenalty: 0.0,
				responseMimeType: 'application/json',
			}))
		})

		test('always uses the fixed model and seed, regardless of client defaults', async () => {
			mock_response('{}')
			const ai = create_ai_client({ app: 'ontology', feature: 'semantic-search', gateway })

			await ai.generate_json({ contents: {}, schema: { type: 'object' } })

			const [url, init] = fetch_mock.mock.calls[0]
			expect(url).toContain(':generateContent')
			expect(url).toContain('/models/gemini-3.5-flash')
			const body = JSON.parse(init.body)
			expect(body.generationConfig).toEqual(expect.objectContaining({ seed: 42 }))
		})

		test('leaves temperature at the model default unless a caller overrides it', async () => {
			mock_response('{}')
			const ai = create_ai_client({ app: 'ontology', feature: 'semantic-search', gateway })

			await ai.generate_json({ contents: {}, schema: { type: 'object' } })

			const [, init] = fetch_mock.mock.calls[0]
			const body = JSON.parse(init.body)
			expect(body.generationConfig).not.toHaveProperty('temperature')
		})

		test('ignores an attempt to override the fixed seed', async () => {
			mock_response('{}')
			const ai = create_ai_client({ app: 'ontology', feature: 'semantic-search', gateway })

			await ai.generate_json({
				contents: {},
				schema: { type: 'object' },
				// eslint-disable-next-line @typescript-eslint/no-explicit-any -- seed isn't a valid override key; this simulates a caller bypassing the type with `as any`.
				config: { seed: 41 } as any,
			})

			const [, init] = fetch_mock.mock.calls[0]
			const body = JSON.parse(init.body)
			expect(body.generationConfig.seed).toBe(42)
		})
	})

	describe('generate_text', () => {
		test('returns the raw response text', async () => {
			mock_response('hello there')
			const ai = create_ai_client({ app: 'ontology', feature: 'semantic-search', gateway })

			const result = await ai.generate_text({ contents: 'hi' })

			expect(result).toBe('hello there')
		})

		test('throws AiResponseError on an empty response', async () => {
			mock_response('')
			const ai = create_ai_client({ app: 'ontology', feature: 'semantic-search', gateway })

			await expect(ai.generate_text({ contents: 'hi' })).rejects.toThrow(AiResponseError)
		})
	})

	describe('create_embedding_client', () => {
		function mock_embedding(values: number[]) {
			fetch_mock.mockResolvedValue({ ok: true, json: async () => ({ embedding: { values } }) })
		}

		test('sends one text to gemini-embedding-2 at the global location, whatever location the gateway config names', async () => {
			mock_embedding(Array(EMBEDDING_DIMENSIONS).fill(0.1))
			const embedder = create_embedding_client({ app: 'ontology', feature: 'semantic-search', gateway })

			await embedder.embed_text({ purpose: 'query', text: 'joy' })

			const [url, init] = fetch_mock.mock.calls[0]
			expect(url).toBe(
				'https://gateway.ai.cloudflare.com/v1/acct-1/tabitha/google-vertex-ai/v1beta1/projects/my-project/locations/global/publishers/google/models/gemini-embedding-2:embedContent',
			)
			expect(init.headers).toEqual(expect.objectContaining({
				'cf-aig-authorization': 'Bearer gw-token',
				'cf-aig-metadata': JSON.stringify({ app: 'ontology', feature: 'semantic-search' }),
			}))
			expect(JSON.parse(init.body)).toEqual({
				content: { parts: [{ text: 'task: search result | query: joy' }] },
				outputDimensionality: EMBEDDING_DIMENSIONS,
			})
		})

		test('returns the embedding values and merges extra http headers in', async () => {
			const values = Array(EMBEDDING_DIMENSIONS).fill(0.5)
			mock_embedding(values)
			const embedder = create_embedding_client({ app: 'ontology', feature: 'semantic-search', gateway })

			const result = await embedder.embed_text({ purpose: 'query', text: 'joy', http_headers: { 'cf-aig-cache-ttl': '60' } })

			expect(result).toEqual(values)
			expect(fetch_mock.mock.calls[0][1].headers).toEqual(expect.objectContaining({ 'cf-aig-cache-ttl': '60' }))
		})

		test('throws AiResponseError when the vector has the wrong number of dimensions', async () => {
			mock_embedding([0.1, 0.2])
			const embedder = create_embedding_client({ app: 'ontology', feature: 'semantic-search', gateway })

			await expect(embedder.embed_text({ purpose: 'query', text: 'joy' })).rejects.toThrow(AiResponseError)
		})

		test('throws AiResponseError on a non-ok gateway response', async () => {
			fetch_mock.mockResolvedValue({ ok: false, status: 429, statusText: 'Too Many Requests', text: async () => 'slow down' })
			const embedder = create_embedding_client({ app: 'ontology', feature: 'semantic-search', gateway })

			await expect(embedder.embed_text({ purpose: 'query', text: 'joy' })).rejects.toThrow('429')
		})
	})

	describe('format_embedding_input', () => {
		test('prefixes a query with the search-result task', () => {
			expect(format_embedding_input({ purpose: 'query', text: 'joy' })).toBe('task: search result | query: joy')
		})

		test('labels a document with its title', () => {
			expect(format_embedding_input({ purpose: 'document', title: 'rejoice', text: 'to feel great happiness' }))
				.toBe('title: rejoice | text: to feel great happiness')
		})

		test('falls back to "none" for a document without a title', () => {
			expect(format_embedding_input({ purpose: 'document', text: 'to feel great happiness' }))
				.toBe('title: none | text: to feel great happiness')
		})
	})
})
