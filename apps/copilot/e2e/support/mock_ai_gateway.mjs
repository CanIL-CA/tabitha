// Preloaded via NODE_OPTIONS (see playwright.config.js) before the e2e dev server starts, so
// server-side calls to external APIs that would otherwise make a real (billed, or credential-
// less in CI) network request are intercepted with a canned response instead:
//  - the Vertex AI Gateway (packages/ai's create_ai_client)
//  - Aquifer (brief.ts's SIL Translator's Notes lookup, used by the "brief" mode pipeline)
// Every other origin (sources.tabitha.bible, targets.tabitha.bible) still hits the real network
// as usual.
//
// This patches globalThis.fetch directly rather than using undici's MockAgent/
// setGlobalDispatcher: that approach depends on a version-namespaced Symbol registry shared
// between Node's own internal undici (which implements the built-in fetch) and whatever undici
// version is installed as a package dependency. When the two disagree on the active registry key,
// setGlobalDispatcher silently falls back to a dispatcher only the external package can see,
// while the real built-in fetch keeps using its own -- confirmed to reproduce exactly this way in
// CI (the mock module loaded with no errors, but the real Cloudflare gateway still got the
// request). A direct fetch override has no such indirection.
const original_fetch = globalThis.fetch

function mock_semantic_notes(llm_input) {
	const notes = (llm_input.triggers ?? []).map(trigger => ({
		meaning: `[e2e mock] meaning for trigger "${trigger.name}"`,
		check: '[e2e mock] check whether the translation carries this meaning.',
		quoted_text: '',
		trigger: { name: trigger.name, node_id: trigger.node_id },
	}))
	return { notes, lwc_text: llm_input.lwc_text ?? llm_input.english_text }
}

function mock_brief_tnn_output() {
	return {
		section4: { sourcePointabilityRows: [], notes: [{ text: '[e2e mock] TNN note for this verse.' }], excluded: [] },
		section5: { cultural: [], background: [] },
		section6: { keywords: [] },
		section7: { decisions: [], resolvedUpstream: [] },
	}
}

function mock_translations(llm_input) {
	return llm_input.map(({ text }) => text)
}

// copilot makes three kinds of generate_json call; each is told apart by the response schema it
// requests, so every call gets a response of the shape its caller parses.
function mock_response_for({ schema, llm_input }) {
	if (schema?.properties?.section4) return mock_brief_tnn_output()
	if (schema?.type === 'array') return mock_translations(llm_input)
	return mock_semantic_notes(llm_input)
}

globalThis.fetch = async (input, init) => {
	const url = typeof input === 'string' ? input : input.url
	const method = init?.method ?? 'GET'

	if (new URL(url).hostname === 'gateway.ai.cloudflare.com' && url.includes(':generateContent') && method === 'POST') {
		const wire_request = JSON.parse(init.body)
		const llm_input = JSON.parse(wire_request.contents[0].parts[0].text)
		const schema = wire_request.generationConfig?.responseJsonSchema

		const response_text = JSON.stringify(mock_response_for({ schema, llm_input }))

		return new Response(JSON.stringify({
			candidates: [{
				content: { role: 'model', parts: [{ text: response_text }] },
				finishReason: 'STOP',
			}],
		}), { status: 200, headers: { 'content-type': 'application/json' } })
	}

	// brief.ts's get_tnn_based_info() looks up a resource id via /resources/search, then fetches
	// that resource's plain-text content via /resources/:id.
	if (url.startsWith('https://api.aquifer.bible/resources/search') && method === 'GET') {
		return new Response(JSON.stringify({ items: [{ id: 1 }] }), { status: 200, headers: { 'content-type': 'application/json' } })
	}

	if (/^https:\/\/api\.aquifer\.bible\/resources\/\d+$/.test(url) && method === 'GET') {
		return new Response('[e2e mock] SIL Translator\'s Notes content for this verse.', { status: 200 })
	}

	return original_fetch(input, init)
}
