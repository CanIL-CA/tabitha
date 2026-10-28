// @ts-check
import inspector from 'node:inspector'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** Playwright and run_e2e.ts both run from the app's own directory, so this is `apps/<app>/coverage/e2e-server`. */
export const SERVER_COVERAGE_DIR = resolve('coverage/e2e-server')

const INLINE_SOURCE_MAP = /\/\/# sourceMappingURL=data:application\/json;(?:charset=utf-8;)?base64,([\w+/=]+)/

/**
 * Ties one server-side script's V8 coverage to the files on disk, or returns null for anything that
 * isn't workspace source code with an inline source map (Node internals, dependencies, the Vite config).
 *
 * Vite's SSR module runner evaluates each module with an inline source map whose `sources` are relative
 * to the module's file, while monocart resolves relative `sources` against the working directory, so
 * they're made absolute here (the same fix @tabitha/vite-config/playwright makes for browser scripts).
 *
 * @param {{ url: string, functions: unknown[], source: string }} script
 */
export function server_entry_on_disk({ url, functions, source }) {
	if (!url.startsWith('file:') && !/^(?:[a-zA-Z]:)?[\\/]/.test(url)) return null
	const file_url = url.startsWith('file:') ? new URL(url) : pathToFileURL(url)
	const file_path = fileURLToPath(file_url)
	if (file_path.includes('node_modules') || !/[\\/]src[\\/]/.test(file_path)) return null

	const inline_map = source.match(INLINE_SOURCE_MAP)?.[1]
	if (!inline_map) return null

	/** @type {{ sources: string[], sourceRoot?: string }} */
	const source_map = JSON.parse(Buffer.from(inline_map, 'base64').toString('utf-8'))
	const map_dir = resolve(dirname(file_path), source_map.sourceRoot ?? '')
	return { url: file_url.href, source, functions, sourceMap: { ...source_map, sourceRoot: undefined, sources: source_map.sources.map(entry => resolve(map_dir, entry)) } }
}

/**
 * Records V8 coverage of this dev server's own code, which browser coverage can't see (every
 * `+server.ts`, `+page.server.ts`, `hooks.server.ts` and the server code they call), and writes it to
 * `coverage/e2e-server` when the process gets SIGINT or SIGTERM, or exits. scripts/ci/merge_coverage.ts adds
 * it to the browser coverage in the e2e layer. SIGKILL skips the write.
 *
 * Starts after the Vite config is loaded, before the first request loads any app module.
 */
export function record_server_coverage() {
	const session = new inspector.Session()
	session.connect()

	/**
	 * `session.post` runs synchronously for an in-process session, which is what lets the `exit` handler
	 * below read the coverage out. A callback that is never invoked leaves `result` unset.
	 *
	 * @param {string} method
	 * @param {object} [params]
	 * @returns {any}
	 */
	function post(method, params) {
		let result
		session.post(method, params, (error, value) => {
			if (error) throw error
			result = value
		})
		return result
	}

	post('Profiler.enable')
	post('Profiler.startPreciseCoverage', { callCount: true, detailed: true })
	post('Debugger.enable')

	let written = false
	function write_coverage() {
		if (written) return
		written = true
		/** @type {{ result: { scriptId: string, url: string, functions: unknown[] }[] }} */
		const { result } = post('Profiler.takePreciseCoverage')
		const entries = result.flatMap(({ scriptId, url, functions }) => {
			const { scriptSource } = post('Debugger.getScriptSource', { scriptId })
			return server_entry_on_disk({ url, functions, source: scriptSource }) ?? []
		})
		if (entries.length === 0) return
		mkdirSync(SERVER_COVERAGE_DIR, { recursive: true })
		writeFileSync(join(SERVER_COVERAGE_DIR, `${process.pid}.json`), JSON.stringify(entries))
	}

	// Turborepo force-kills a dev server that is slow to shut down, and Vite's own signal handler waits on
	// open connections before exiting, so the write happens on the signal itself (registered before Vite's).
	process.once('SIGINT', write_coverage)
	process.once('SIGTERM', write_coverage)
	process.on('exit', write_coverage)
}
