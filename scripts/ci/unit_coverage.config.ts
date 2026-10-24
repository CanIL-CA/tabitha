// monocart options for each workspace's vitest run: report_coverage.ts passes this file to
// vitest-monocart-coverage, so Node loads it inside vitest and it can't import this folder's other
// (extensionless) modules. monocart_report.ts reuses its source rules for the e2e layer.
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compile } from 'svelte/compiler'
import { transformWithOxc } from 'vite'

/**
 * A workspace-relative path to code the report counts: under `src/`, without tests, types or generated
 * messages. Takes either separator, since node:path's `relative()` returns backslashes on Windows.
 */
export function is_source_code(native_path: string): boolean {
	const path = native_path.replaceAll('\\', '/')
	return path.startsWith('src/')
		&& /\.(js|ts|svelte)$/.test(path)
		&& !/\.(test|spec)\.ts$|\.d\.ts$/.test(path)
		&& !path.startsWith('src/lib/paraglide/')
}

/**
 * monocart parses files no test loaded as JavaScript, so `.ts` and `.svelte` files are compiled first,
 * with a source map back to the original. Svelte 5 strips TypeScript in components itself.
 */
export async function compile_untested(entry: { url: string, source: string, sourceMap?: unknown }) {
	const file = fileURLToPath(entry.url)
	if (file.endsWith('.svelte')) {
		const { js } = compile(entry.source, { filename: file, dev: true })
		entry.source = js.code
		entry.sourceMap = { ...js.map, sources: js.map.sources.map(source => resolve(dirname(file), source)) }
		return
	}
	if (file.endsWith('.ts')) {
		const { code, map } = await transformWithOxc(entry.source, file)
		entry.source = code
		entry.sourceMap = map
	}
}

// Vitest runs in the workspace's directory, so paths here are relative to it. Only the workspace's
// own src/ counts: another workspace's code that a test happens to load is left to that
// workspace's own tests. Files no test loaded count as 0% covered.
export default {
	name: 'unit',
	outputDir: './coverage/unit',
	reports: ['json', 'json-summary'],
	logging: 'error',
	all: {
		dir: './src',
		filter: (path: string) => is_source_code(relative(process.cwd(), path)) && 'js',
		transformer: compile_untested,
	},
	sourceFilter: is_source_code,
}
