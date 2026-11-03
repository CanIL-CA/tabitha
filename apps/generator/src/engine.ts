// Thin wrapper around TBTA's generation engine, compiled to WebAssembly by tools/tbta-wasm.
// Shared by the Worker and by tools/tbta-wasm's data preparation, so it uses no Worker-only APIs.

export type EngineModule = {
	ccall: (name: string, return_type: 'number', arg_types: string[], args: (string | number)[]) => number
	UTF8ToString: (pointer: number) => string
	_free: (pointer: number) => void
	FS: {
		mkdir: (path: string) => void
		writeFile: (path: string, data: Uint8Array) => void
		readFile: (path: string) => Uint8Array
	}
}

export type CreateEngine = (module_arg: object) => Promise<EngineModule>

export const SEGMENTS = {
	complex_concept_insertion: 0,
	last_structured: 1,
	last: 2,
} as const

export type Segment = keyof typeof SEGMENTS

// The engine's browser build opens every database under this folder (TBTA_BROWSER in TbtaLib).
const DATA_DIR = '/persist'
const BIBLE_SOURCE_TEXT = 4

export function load_engine({ create_engine, wasm_module, databases, log }: {
	create_engine: CreateEngine
	wasm_module: WebAssembly.Module
	databases: Record<string, Uint8Array>
	log: (line: string) => void
}) {
	const module_arg = {
		// Workers can't compile WebAssembly from bytes at runtime, so the caller passes a compiled module.
		instantiateWasm(imports: WebAssembly.Imports, on_instance: (instance: WebAssembly.Instance) => void) {
			WebAssembly.instantiate(wasm_module, imports).then(on_instance)
			return {}
		},
		preRun: [() => {
			const engine = module_arg as unknown as EngineModule
			engine.FS.mkdir(DATA_DIR)
			for (const [name, bytes] of Object.entries(databases)) engine.FS.writeFile(`${DATA_DIR}/${name}`, bytes)
		}],
		print: log,
		printErr: log,
	}
	return create_engine(module_arg)
}

export function generate_verse({ engine, language, audience, book, chapter, verse, segment, encoding, previous_encoding }: {
	engine: EngineModule
	language: string
	audience: number
	book: number
	chapter: number
	verse: number
	segment: Segment
	encoding: string
	previous_encoding: string
}) {
	const pointer = engine.ccall('GenerateVerseFromEncoding', 'number',
		['string', 'number', 'number', 'number', 'number', 'number', 'number', 'string', 'string'],
		[language, audience, BIBLE_SOURCE_TEXT, book, chapter, verse, SEGMENTS[segment], encoding, previous_encoding])
	const text = engine.UTF8ToString(pointer)
	engine._free(pointer)
	return text.trim()
}

export function read_database({ engine, name }: { engine: EngineModule, name: string }) {
	return engine.FS.readFile(`${DATA_DIR}/${name}`)
}
