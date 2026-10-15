import type { GenerateContentConfig } from '@google/genai'

/**
 * Config for the shared Cloudflare AI Gateway, routed exclusively through Google Vertex AI
 * (never plain Google AI Studio) -- Vertex is a hard requirement for global-deployment/
 * data-residency needs, not something app-by-app choice should be allowed to drop. `project`
 * and `location` are Vertex's own required routing fields. `location` applies to generation
 * calls only -- the embedding client always routes to `global`, the one location Vertex serves
 * its embedding model from. Owned entirely by
 * the package -- never overridable per call. `gateway_name` isn't here: there's exactly one
 * TaBiThA gateway (`tools/gateway/config.ts`), so it's fixed alongside the model and seed in
 * client.ts rather than repeated as a literal at every call site.
 */
export type AiGatewayConfig = {
	account_id: string
	token: string
	project: string
	location: string
}

/**
 * Generation behavior overridable at the client-defaults or per-call layer. `model` and `seed`
 * are deliberately excluded -- every existing call site had drifted to a different value for
 * both without a real reason, so they're fixed centrally in client.ts instead of left as an
 * override surface. Reintroduce a narrow override for either only if a real per-call need for it
 * emerges.
 */
export type AiCallDefaults = Partial<Omit<GenerateContentConfig, 'seed'>>

/**
 * What one successful generation call cost, as Vertex's `usageMetadata` and the gateway's
 * `cf-aig-cache-status` header report it. Billed output is `output_tokens + thought_tokens`.
 * `cache_status` is empty when the gateway sent no header; `thinking_level` is `default` when the
 * call left Vertex's own level in place.
 */
export type AiCallUsage = {
	readonly feature: string
	readonly prompt_tokens: number
	readonly output_tokens: number
	readonly thought_tokens: number
	readonly cached_tokens: number
	readonly cache_status: string
	readonly thinking_level: string
	readonly duration_ms: number
}

export type CreateAiClientOptions = {
	app: string
	feature: string
	gateway: AiGatewayConfig
	defaults?: AiCallDefaults
	// Called once per successful generation call. A throw here never fails the call.
	on_usage?: (usage: AiCallUsage) => void
}

export type GenerateJsonParams = {
	contents: unknown
	system_instruction?: string
	schema: object
	config?: AiCallDefaults
}

export type GenerateTextParams = {
	contents: unknown
	system_instruction?: string
	config?: AiCallDefaults
}

export type AiClient = {
	generate_json<T>(params: GenerateJsonParams): Promise<T>
	generate_text(params: GenerateTextParams): Promise<string>
}

export type CreateEmbeddingClientOptions = {
	app: string
	feature: string
	gateway: AiGatewayConfig
}

/**
 * A search query and the documents it's matched against are embedded differently -- see
 * format_embedding_input in client.ts. `title` is a document's own short label (e.g. a concept's
 * stem), which the model weighs alongside its text.
 */
export type EmbedTextParams =
	| { purpose: 'query', text: string, http_headers?: Record<string, string> }
	| { purpose: 'document', text: string, title?: string, http_headers?: Record<string, string> }

export type EmbeddingClient = {
	embed_text(params: EmbedTextParams): Promise<number[]>
}
