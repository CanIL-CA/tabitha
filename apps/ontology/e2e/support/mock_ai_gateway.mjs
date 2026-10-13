// Preloaded via NODE_OPTIONS (see playwright.config.js) before the e2e dev server starts, so
// server-side calls to the Vertex AI Gateway (packages/ai's create_embedding_client, used by
// semantic_search.ts) are intercepted with a canned response instead of making a real, billed
// call through Cloudflare's gateway. Every other origin still hits the real network as usual.
//
// This patches globalThis.fetch directly rather than using undici's MockAgent/
// setGlobalDispatcher -- see apps/copilot/e2e/support/mock_ai_gateway.mjs for why (that approach
// silently failed to intercept in CI, depending on Node/undici version-specific internals a
// direct fetch override doesn't need).

// Mirrors EMBEDDING_DIMENSIONS in packages/ai/src/client.ts -- this preload runs as plain Node
// before Vite, so it can't import the TypeScript package directly.
const EMBEDDING_DIMENSIONS = 768

const original_fetch = globalThis.fetch

globalThis.fetch = async (input, init) => {
	const url = typeof input === 'string' ? input : input.url
	const method = init?.method ?? 'GET'

	if (new URL(url).hostname === 'gateway.ai.cloudflare.com' && url.includes(':embedContent') && method === 'POST') {
		// Any fixed vector of the right size -- the Vectorize index it would be queried against has
		// no local simulation, so its values never matter here.
		return new Response(JSON.stringify({
			embedding: { values: Array(EMBEDDING_DIMENSIONS).fill(0.1) },
		}), { status: 200, headers: { 'content-type': 'application/json' } })
	}

	return original_fetch(input, init)
}
