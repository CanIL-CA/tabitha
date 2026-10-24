import { describe, expect, it } from 'bun:test'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { entry_on_disk } from './playwright.js'

const APP_DIR = resolve('/repo/apps/editor')
const UI_FOOTER = resolve('/repo/packages/ui/src/Footer.svelte')

function with_inline_map({ code, map }: { code: string, map: object }): string {
	return `${code}\n//# sourceMappingURL=data:application/json;base64,${Buffer.from(JSON.stringify(map)).toString('base64')}\n`
}

describe('entry_on_disk', () => {
	it("points an app file at the app's own src/ on disk", () => {
		const entry = entry_on_disk({ entry: { url: 'http://localhost:1337/src/lib/check.ts?t=1792803053313' }, app_dir: APP_DIR })
		expect(entry?.url).toBe(pathToFileURL(resolve(APP_DIR, 'src/lib/check.ts')).href)
	})

	it('points a file Vite serves from /@fs/ at that absolute path', () => {
		// /@fs/repo/… here, /@fs/D:/repo/… on Windows
		const url = `http://localhost:1337/@fs${pathToFileURL(UI_FOOTER).pathname}?v=a9d1760d`
		const entry = entry_on_disk({ entry: { url }, app_dir: APP_DIR })
		expect(entry?.url).toBe(pathToFileURL(UI_FOOTER).href)
	})

	it("drops scripts that aren't files on disk", () => {
		for (const url of ['http://localhost:1337/@vite/client', 'http://localhost:1337/node_modules/.vite/deps/devalue.js', 'http://localhost:1337/']) {
			expect(entry_on_disk({ entry: { url }, app_dir: APP_DIR })).toBeNull()
		}
	})

	it("makes the inline source map's sources absolute, relative to the served file", () => {
		const source = with_inline_map({ code: 'export const n = 1', map: { version: 3, sources: ['+page.svelte'], mappings: 'AAAA' } })
		const entry = entry_on_disk({ entry: { url: 'http://localhost:1337/src/routes/+page.svelte', source }, app_dir: APP_DIR })

		expect(entry?.sourceMap?.sources).toEqual([resolve(APP_DIR, 'src/routes/+page.svelte')])
		expect(entry?.source).toBe(source)
	})

	it("resolves sources against the map's sourceRoot", () => {
		const source = with_inline_map({ code: 'export const n = 1', map: { version: 3, sourceRoot: '../shared', sources: ['words.ts'], mappings: 'AAAA' } })
		const entry = entry_on_disk({ entry: { url: 'http://localhost:1337/src/lib/words.ts', source }, app_dir: APP_DIR })
		expect(entry?.sourceMap?.sources).toEqual([resolve(APP_DIR, 'src/shared/words.ts')])
	})
})
