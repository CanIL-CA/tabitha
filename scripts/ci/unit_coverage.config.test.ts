import { describe, expect, it } from 'bun:test'
import { compile_untested, is_source_code } from './unit_coverage.config'

describe('is_source_code', () => {
	it('keeps workspace source and leaves out tests, declarations and generated messages', () => {
		expect(is_source_code('src/lib/check.ts')).toBe(true)
		expect(is_source_code('src/routes/+page.svelte')).toBe(true)
		expect(is_source_code('src/lib/check.test.ts')).toBe(false)
		expect(is_source_code('src/app.d.ts')).toBe(false)
		expect(is_source_code('src/lib/paraglide/messages.js')).toBe(false)
		expect(is_source_code('e2e/editor.spec.ts')).toBe(false)
		expect(is_source_code('../../packages/types/src/index.ts')).toBe(false)
	})
})

describe('compile_untested', () => {
	it('compiles a TypeScript file to JavaScript with a map back to the original', async () => {
		const entry: { url: string, source: string, sourceMap?: unknown } = { url: 'file:///repo/apps/editor/src/lib/count.ts', source: 'export function count(words: string[]): number {\n\treturn words.length\n}\n' }
		await compile_untested(entry)

		expect(entry.source).not.toContain(': number')
		expect(entry.sourceMap).toMatchObject({ sources: ['/repo/apps/editor/src/lib/count.ts'] })
	})

	it('compiles a Svelte component, with an absolute path to the original in its map', async () => {
		const entry: { url: string, source: string, sourceMap?: unknown } = { url: 'file:///repo/apps/editor/src/lib/Verse.svelte', source: '<script lang="ts">\n\tlet { text }: { text: string } = $props()\n</script>\n\n<p>{text}</p>\n' }
		await compile_untested(entry)

		expect(entry.source).not.toContain('<script')
		expect(entry.sourceMap).toMatchObject({ sources: ['/repo/apps/editor/src/lib/Verse.svelte'] })
	})

	it('leaves plain JavaScript alone', async () => {
		const entry = { url: 'file:///repo/apps/editor/src/lib/env.js', source: 'export const MODE = "test"\n' }
		await compile_untested(entry)
		expect(entry).toEqual({ url: 'file:///repo/apps/editor/src/lib/env.js', source: 'export const MODE = "test"\n' })
	})
})
