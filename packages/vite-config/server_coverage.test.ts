import { describe, expect, it } from 'bun:test'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { server_entry_on_disk } from './server_coverage.js'

const CHECK_TS = resolve('/repo/apps/editor/src/lib/server/check.ts')

function with_inline_map({ code, map }: { code: string, map: object }): string {
	return `${code}\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(map)).toString('base64')}\n`
}

describe('server_entry_on_disk', () => {
	it("makes the inline source map's sources absolute, relative to the module's file", () => {
		const source = with_inline_map({ code: 'export const n = 1', map: { version: 3, sources: ['check.ts'], mappings: 'AAAA' } })
		const entry = server_entry_on_disk({ url: CHECK_TS, functions: [], source })

		expect(entry?.url).toBe(pathToFileURL(CHECK_TS).href)
		expect(entry?.sourceMap.sources).toEqual([CHECK_TS])
		expect(entry?.source).toBe(source)
	})

	it('accepts a file URL as the script URL', () => {
		const source = with_inline_map({ code: 'export const n = 1', map: { version: 3, sources: ['check.ts'], mappings: 'AAAA' } })
		expect(server_entry_on_disk({ url: pathToFileURL(CHECK_TS).href, functions: [], source })?.url).toBe(pathToFileURL(CHECK_TS).href)
	})

	it('resolves sources against the map\'s sourceRoot', () => {
		const source = with_inline_map({ code: 'export const n = 1', map: { version: 3, sourceRoot: '../', sources: ['check.ts'], mappings: 'AAAA' } })
		expect(server_entry_on_disk({ url: CHECK_TS, functions: [], source })?.sourceMap.sources).toEqual([resolve('/repo/apps/editor/src/lib/check.ts')])
	})

	it("drops scripts that aren't workspace source code", () => {
		const source = with_inline_map({ code: 'export const n = 1', map: { version: 3, sources: ['x.js'], mappings: 'AAAA' } })
		for (const url of ['node:internal/errors', resolve('/repo/node_modules/svelte/src/index.js'), resolve('/repo/apps/editor/vite.config.ts'), 'http://localhost:1337/src/lib/check.ts']) {
			expect(server_entry_on_disk({ url, functions: [], source })).toBeNull()
		}
	})

	it('drops source code with no inline source map', () => {
		expect(server_entry_on_disk({ url: CHECK_TS, functions: [], source: 'export const n = 1' })).toBeNull()
	})
})
