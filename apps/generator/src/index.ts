import create_engine from '#engine/tbta.js'
import ENGINE_WASM from '#engine/tbta.wasm'
import ONTOLOGY_DB from '#engine/Ontology.sqlite'
import ENGLISH_DB from '#engine/English.sqlite'
import { generate_verse, load_engine, type EngineModule } from './engine'
import { parse_generate_request } from './generate_request'

const LANGUAGE = 'English'

// One engine per isolate. Loading it (lexicons, mappings) is the slow part, about 5 s of CPU on
// Cloudflare; each verse afterwards takes well under 100 ms.
let engine_ready: Promise<EngineModule> | undefined
const engine_log: string[] = []

async function start_engine() {
	const engine = await load_engine({
		create_engine,
		wasm_module: ENGINE_WASM,
		databases: {
			'Ontology.sqlite': new Uint8Array(ONTOLOGY_DB),
			[`${LANGUAGE}.sqlite`]: new Uint8Array(ENGLISH_DB),
		},
		log: line => engine_log.push(line),
	})
	// The engine opens its databases and loads the lexicons on the first generation, so run an
	// empty one now: that makes /warm do the slow part ahead of the user's first real request.
	generate_verse({ engine, language: LANGUAGE, audience: 1, book: 1, chapter: 1, verse: 1, segment: 'last', encoding: '', previous_encoding: '' })
	return engine
}

function get_engine() {
	engine_ready ??= start_engine()
	return engine_ready
}

async function handle_generate(request: Request) {
	const parsed = parse_generate_request(await request.json().catch(() => null))
	if ('error' in parsed) return Response.json({ error: parsed.error }, { status: 400 })

	const engine = await get_engine()
	engine_log.length = 0
	const text = generate_verse({ engine, language: LANGUAGE, ...parsed.job })
	// The engine reports failures on stderr and returns an empty string, so pass its log back.
	if (text === '') return Response.json({ error: 'The engine produced no text', log: engine_log }, { status: 422 })
	return Response.json({ text })
}

async function handle_warm() {
	await get_engine()
	return Response.json({ ready: true })
}

export default {
	async fetch(request: Request) {
		const { pathname } = new URL(request.url)
		if (request.method === 'POST' && pathname === '/generate') return handle_generate(request)
		if (request.method === 'POST' && pathname === '/warm') return handle_warm()
		return Response.json({ error: 'Not found' }, { status: 404 })
	},
}
