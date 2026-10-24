import { describe, expect, it } from 'bun:test'
import { entry_on_disk } from './playwright.js'

const APP_DIR = '/repo/apps/editor'

function with_inline_map({ code, map }: { code: string, map: object }): string {
	return `${code}\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(map)).toString('base64')}\n`
}

describe('entry_on_disk', () => {
	it("points an app file at the app's own src/ on disk", () => {
		const entry = entry_on_disk({ entry: { url: 'http://localhost:1337/src/lib/check.ts?t=1792803053313' }, app_dir: APP_DIR })
		expect(entry?.url).toBe('file:///repo/apps/editor/src/lib/check.ts')
	})

	it('points a file Vite serves from /@fs/ at that absolute path', () => {
		const entry = entry_on_disk({ entry: { url: 'http://localhost:1337/@fs/repo/packages/ui/src/Footer.svelte?v=a9d1760d' }, app_dir: APP_DIR })
		expect(entry?.url).toBe('file:///repo/packages/ui/src/Footer.svelte')
	})

	it("drops scripts that aren't files on disk", () => {
		for (const url of ['http://localhost:1337/@vite/client', 'http://localhost:1337/node_modules/.vite/deps/devalue.js', 'http://localhost:1337/']) {
			expect(entry_on_disk({ entry: { url }, app_dir: APP_DIR })).toBeNull()
		}
	})

	it("makes the inline source map's sources absolute, relative to the served file", () => {
		const source = with_inline_map({ code: 'export const n = 1', map: { version: 3, sources: ['+page.svelte'], mappings: 'AAAA' } })
		const entry = entry_on_disk({ entry: { url: 'http://localhost:1337/src/routes/+page.svelte', source }, app_dir: APP_DIR })

		expect(entry?.sourceMap?.sources).toEqual(['/repo/apps/editor/src/routes/+page.svelte'])
		expect(entry?.source).toBe(source)
	})

	it("resolves sources against the map's sourceRoot", () => {
		const source = with_inline_map({ code: 'export const n = 1', map: { version: 3, sourceRoot: '../shared', sources: ['words.ts'], mappings: 'AAAA' } })
		const entry = entry_on_disk({ entry: { url: 'http://localhost:1337/src/lib/words.ts', source }, app_dir: APP_DIR })
		expect(entry?.sourceMap?.sources).toEqual(['/repo/apps/editor/src/shared/words.ts'])
	})
})
