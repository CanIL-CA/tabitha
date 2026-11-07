// Build outputs of tools/tbta-wasm, imported through the "#engine/*" alias in package.json.

declare module '#engine/tbta.js' {
	const create_engine: import('./engine').CreateEngine
	export default create_engine
}

declare module '#engine/tbta.wasm' {
	const wasm_module: WebAssembly.Module
	export default wasm_module
}

// Bundled as Data modules (see "rules" in wrangler.jsonc).
declare module '#engine/*.sqlite' {
	const bytes: ArrayBuffer
	export default bytes
}
