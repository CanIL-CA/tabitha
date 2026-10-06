import { AiResponseError } from './errors'
import type {
	AiCallDefaults,
	AiClient,
	AiGatewayConfig,
	CreateAiClientOptions,
	CreateEmbeddingClientOptions,
	EmbedTextParams,
	EmbeddingClient,
	GenerateJsonParams,
	GenerateTextParams,
} from './types'

// Fixed for every call site -- not overridable. For more info, see the type comments in types.ts.
const FIXED_MODEL = 'gemini-3.5-flash'
const FIXED_SEED = 42 // 😏
const GATEWAY_NAME = 'tabitha'
// The gateway retries failed requests (retry_* in tools/gateway/config.ts), but a slow provider
// response never fails on its own, so without this each attempt waits indefinitely. Cuts an
// attempt whose first byte takes longer, so the gateway retries it. Healthy calls' first byte
// arrives within about 80s at p99, and most calls during a Vertex slowdown still answer
// within 60s, so a retry usually lands. https://developers.cloudflare.com/ai-gateway/configuration/request-handling/
const GATEWAY_ATTEMPT_TIMEOUT_MS = 60_000
// The gateway's final retry attempt waits however long the provider takes, and fetch has no
// timeout of its own, so this bounds the whole call: room for two timed-out attempts plus a
// final one, after which the caller gets a retryable error instead of hanging indefinitely.
const REQUEST_TIMEOUT_MS = 240_000
// Vertex AI's REST API version the gateway forwards to -- matches what @google/genai's SDK sent
// by default (its internal VERTEX_AI_API_DEFAULT_VERSION), kept in sync now that this package
// builds the request by hand instead of going through that SDK.
const VERTEX_API_VERSION = 'v1beta1'

// Exported so a caller storing vectors can tell when they were made by a different model.
export const EMBEDDING_MODEL = 'gemini-embedding-2'
// Vertex serves gemini-embedding-2 only at the global location, regardless of the location a
// caller routes its generation calls through.
const EMBEDDING_LOCATION = 'global'
// gemini-embedding-2 defaults to 3072 dimensions; 768 is one of Google's recommended reduced
// sizes, and the model normalizes reduced-size output itself, so cosine and dot-product agree.
export const EMBEDDING_DIMENSIONS = 768

const PACKAGE_DEFAULTS: AiCallDefaults = {
	temperature: 0.0,
	frequencyPenalty: 0.0,
	presencePenalty: 0.0,
}

type VertexEmbedContentResponse = {
	embedding?: { values?: number[] }
}

type VertexGenerateContentResponse = {
	candidates?: { content?: { parts?: { text?: string, thought?: boolean }[] } }[]
}

export function create_ai_client({ app, feature, gateway, defaults }: CreateAiClientOptions): AiClient {
	const url = build_gateway_url(gateway)

	async function call(contents: unknown, system_instruction: string | undefined, config: AiCallDefaults): Promise<string> {
		// `httpOptions` is a per-call escape hatch (e.g. ontology's AI-Gateway cache-TTL header) --
		// it's HTTP transport config, not a Vertex generationConfig field, so it's pulled out here
		// rather than forwarded into the request body.
		const { httpOptions, ...generation_config } = config as AiCallDefaults & { httpOptions?: { headers?: Record<string, string> } }

		const response = await post_to_gateway({
			url,
			token: gateway.token,
			app,
			feature,
			headers: httpOptions?.headers,
			body: {
				contents: [{ role: 'user', parts: [{ text: JSON.stringify(contents) }] }],
				...system_instruction ? { systemInstruction: { role: 'user', parts: [{ text: system_instruction }] } } : {},
				generationConfig: { ...generation_config, seed: FIXED_SEED },
			},
		})

		const text = extract_text(response as VertexGenerateContentResponse)
		if (!text) {
			throw new AiResponseError(`Empty response from model "${FIXED_MODEL}" (app "${app}", feature "${feature}")`)
		}

		return text
	}

	function resolve_config(overrides?: AiCallDefaults): AiCallDefaults {
		return merge_defaults(PACKAGE_DEFAULTS, defaults, overrides)
	}

	async function generate_json<T>(params: GenerateJsonParams): Promise<T> {
		const text = await call(params.contents, params.system_instruction, {
			...resolve_config(params.config),
			responseMimeType: 'application/json',
			responseJsonSchema: params.schema,
		})

		try {
			return JSON.parse(text) as T
		} catch (cause) {
			throw new AiResponseError(`Failed to parse JSON response from model "${FIXED_MODEL}" (app "${app}", feature "${feature}")`, { cause })
		}
	}

	async function generate_text(params: GenerateTextParams): Promise<string> {
		return call(params.contents, params.system_instruction, resolve_config(params.config))
	}

	return { generate_json, generate_text }
}

/**
 * Embeds one text per call -- gemini-embedding-2's `:embedContent` fuses every part of a request
 * into a single vector and has no batch endpoint, so batching would silently return one blended
 * vector instead of one per text.
 */
export function create_embedding_client({ app, feature, gateway }: CreateEmbeddingClientOptions): EmbeddingClient {
	const url = build_model_url({
		gateway: { ...gateway, location: EMBEDDING_LOCATION },
		model_method: `${EMBEDDING_MODEL}:embedContent`,
	})

	async function embed_text(params: EmbedTextParams): Promise<number[]> {
		const response = await post_to_gateway({
			url,
			token: gateway.token,
			app,
			feature,
			headers: params.http_headers,
			body: {
				content: { parts: [{ text: format_embedding_input(params) }] },
				outputDimensionality: EMBEDDING_DIMENSIONS,
			},
		}) as VertexEmbedContentResponse

		const values = response.embedding?.values ?? []
		if (values.length !== EMBEDDING_DIMENSIONS) {
			throw new AiResponseError(`Expected ${EMBEDDING_DIMENSIONS} dimensions from model "${EMBEDDING_MODEL}", got ${values.length} (app "${app}", feature "${feature}")`)
		}

		return values
	}

	return { embed_text }
}

/**
 * gemini-embedding-2 takes no `task_type` field -- retrieval intent is written into the text itself,
 * in the exact prefixes Google documents: https://ai.google.dev/gemini-api/docs/embeddings
 */
export function format_embedding_input(params: EmbedTextParams): string {
	if (params.purpose === 'query') return `task: search result | query: ${params.text}`

	return `title: ${params.title || 'none'} | text: ${params.text}`
}

type PostToGatewayOptions = {
	readonly url: string
	readonly token: string
	readonly app: string
	readonly feature: string
	readonly headers?: Record<string, string>
	readonly body: object
}

async function post_to_gateway({ url, token, app, feature, headers, body }: PostToGatewayOptions): Promise<unknown> {
	let response: Response
	try {
		response = await fetch(url, {
			method: 'POST',
			headers: {
				'content-type': 'application/json',
				'cf-aig-authorization': `Bearer ${token}`,
				'cf-aig-metadata': JSON.stringify({ app, feature }),
				'cf-aig-request-timeout': String(GATEWAY_ATTEMPT_TIMEOUT_MS),
				...headers,
			},
			body: JSON.stringify(body),
			signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
		})
	} catch (cause) {
		throw_if_timed_out({ cause, app, feature, url })
		console.error(`AI Gateway request failed for app "${app}", feature "${feature}": network error calling ${url}`, cause)
		throw new AiResponseError(`AI Gateway request failed (app "${app}", feature "${feature}"): network error`, { cause })
	}

	if (!response.ok) {
		const response_body = await response.text()
		console.error(`AI Gateway request failed for app "${app}", feature "${feature}": ${response.status} ${response.statusText} -- ${response_body}`)
		throw new AiResponseError(`AI Gateway request failed with status ${response.status} (app "${app}", feature "${feature}")`)
	}

	// The timeout signal also covers reading the body, so a stall mid-response times out here.
	try {
		return await response.json()
	} catch (cause) {
		throw_if_timed_out({ cause, app, feature, url })
		throw cause
	}
}

function throw_if_timed_out({ cause, app, feature, url }: { cause: unknown, app: string, feature: string, url: string }): void {
	if (!(cause instanceof DOMException && cause.name === 'TimeoutError')) return

	console.error(`AI Gateway request timed out for app "${app}", feature "${feature}" after ${REQUEST_TIMEOUT_MS / 1000}s calling ${url}`)
	throw new AiResponseError(`AI Gateway request timed out after ${REQUEST_TIMEOUT_MS / 1000}s (app "${app}", feature "${feature}")`, { cause })
}

function merge_defaults(...layers: (AiCallDefaults | undefined)[]): AiCallDefaults {
	return Object.assign({}, ...layers.filter((layer): layer is AiCallDefaults => Boolean(layer)))
}

/**
 * Same route + resource path @google/genai's SDK builds for `vertexai: true` with a
 * `httpOptions.baseUrl` override: `{baseUrl}/{apiVersion}/projects/{project}/locations/{location}/
 * publishers/google/models/{model}:generateContent`. Traced directly from the SDK's own
 * `ApiClient.constructUrl`/`shouldPrependVertexProjectPath` and `tModel` so this hand-rolled
 * request matches what was previously sent, byte for byte.
 */
export function build_gateway_url(gateway: AiGatewayConfig): string {
	return build_model_url({ gateway, model_method: `${FIXED_MODEL}:generateContent` })
}

function build_model_url({ gateway, model_method }: { gateway: AiGatewayConfig, model_method: string }): string {
	return `https://gateway.ai.cloudflare.com/v1/${gateway.account_id}/${GATEWAY_NAME}/google-vertex-ai/${VERTEX_API_VERSION}`
		+ `/projects/${encodeURIComponent(gateway.project)}/locations/${encodeURIComponent(gateway.location)}`
		+ `/publishers/google/models/${model_method}`
}

function extract_text(response: VertexGenerateContentResponse): string {
	const parts = response.candidates?.[0]?.content?.parts ?? []
	return parts
		.filter((part): part is { text: string, thought?: boolean } => typeof part.text === 'string' && !part.thought)
		.map(part => part.text)
		.join('')
}
