import { fetch_engine_file } from '#lib/generation/generator.js'
import { json } from '@sveltejs/kit'
import { env } from 'cloudflare:workers'
import type { RequestHandler } from './$types'

// Revalidated on every load (a cheap 304 when unchanged), so a redeployed engine is picked up at once.
const CACHE_CONTROL = 'public, no-cache'
// Not content-length or content-encoding: fetch() may already have decompressed the body.
const PASSED_HEADERS = ['content-type', 'etag']

export async function GET({ params: { file }, request }: Parameters<RequestHandler>[0]) {
	// Undefined under `vite dev`, which has no service bindings
	const generator = env.GENERATOR as typeof env.GENERATOR | undefined
	if (!generator) return json({ error: 'Text generation is not available in this environment.' }, { status: 503 })

	const response = await fetch_engine_file({ generator, name: file, if_none_match: request.headers.get('if-none-match') })
	const headers = new Headers({ 'cache-control': CACHE_CONTROL })
	for (const name of PASSED_HEADERS) {
		const value = response.headers.get(name)
		if (value) headers.set(name, value)
	}
	return new Response(response.body, { status: response.status, headers })
}
