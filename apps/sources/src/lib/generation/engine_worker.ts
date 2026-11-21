// Web Worker that runs TBTA's generation engine in the browser, off the page's main thread.
// It downloads the engine and its databases once (about 2.7 MB) and keeps the engine loaded, so
// every generation after that needs no network.
import { generate_verse, load_engine, type CreateEngine, type EngineModule } from '@tabitha/generator/engine'
import type { EngineRequest, EngineResponse } from '#lib/generation/browser_engine.svelte.js'
import type { GenerationJob } from '#lib/generation/verse_generation.js'

const FILES_PATH = '/generator'
const LANGUAGE = 'English'

// The DOM typings describe a window, not a worker, so declare the two worker globals used here.
const worker_scope = self as unknown as {
	postMessage(message: EngineResponse): void
	addEventListener(type: 'message', listener: (event: MessageEvent<EngineRequest>) => void): void
}

const engine_log: string[] = []
let engine_ready: Promise<EngineModule> | undefined

async function download_gzipped({ name }: { name: string }) {
	const response = await fetch(`${FILES_PATH}/${name}.gz`)
	if (!response.ok || !response.body) throw new Error(`Downloading ${name} failed (${response.status})`)
	const unzipped = response.body.pipeThrough(new DecompressionStream('gzip'))
	return new Uint8Array(await new Response(unzipped).arrayBuffer())
}

async function start_engine() {
	const [{ default: create_engine }, wasm_bytes, ontology, language] = await Promise.all([
		import(/* @vite-ignore */ new URL(`${FILES_PATH}/tbta.js`, self.location.origin).href) as Promise<{ default: CreateEngine }>,
		download_gzipped({ name: 'tbta.wasm' }),
		download_gzipped({ name: 'Ontology.sqlite' }),
		download_gzipped({ name: `${LANGUAGE}.sqlite` }),
	])
	const engine = await load_engine({
		create_engine,
		wasm_module: await WebAssembly.compile(wasm_bytes),
		databases: { 'Ontology.sqlite': ontology, [`${LANGUAGE}.sqlite`]: language },
		log: line => engine_log.push(line),
	})
	// The engine loads its lexicons on the first generation, so do an empty one now.
	generate_verse({ engine, language: LANGUAGE, audience: 1, book: 1, chapter: 1, verse: 1, segment: 'last', encoding: '', previous_encoding: '' })
	return engine
}

async function load() {
	const started = performance.now()
	try {
		engine_ready ??= start_engine()
		await engine_ready
		worker_scope.postMessage({ kind: 'ready', load_ms: Math.round(performance.now() - started) })
	}
	catch (failure) {
		engine_ready = undefined
		worker_scope.postMessage({ kind: 'load_failed', error: failure instanceof Error ? failure.message : String(failure) })
	}
}

async function generate({ id, job, audience }: { id: number, job: GenerationJob, audience: number }) {
	const engine = await engine_ready?.catch(() => undefined)
	if (!engine) return worker_scope.postMessage({ kind: 'result', id, error: 'The engine is not loaded.', ms: 0 })
	const started = performance.now()
	engine_log.length = 0
	const text = generate_verse({ engine, language: LANGUAGE, audience, segment: 'last', ...job })
	const ms = Math.round(performance.now() - started)
	// The engine reports failures in its log and returns an empty string.
	if (text === '') return worker_scope.postMessage({ kind: 'result', id, error: engine_log.at(-1) ?? 'The engine produced no text.', ms })
	worker_scope.postMessage({ kind: 'result', id, text, ms })
}

worker_scope.addEventListener('message', event => {
	const request = event.data
	if (request.kind === 'load') void load()
	else void generate(request)
})
