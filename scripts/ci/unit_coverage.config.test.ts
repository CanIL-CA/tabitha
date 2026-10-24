import { describe, expect, it } from 'bun:test'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
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

	it("accepts Windows separators, which node:path's relative() returns there", () => {
		expect(is_source_code('src\\lib\\check.ts')).toBe(true)
		expect(is_source_code('src\\lib\\paraglide\\messages.js')).toBe(false)
	})
})

describe('compile_untested', () => {
	const file_in_editor = (path: string) => resolve('/repo/apps/editor', path)

	it('compiles a TypeScript file to JavaScript with a map back to the original', async () => {
		const entry: { url: string, source: string, sourceMap?: unknown } = { url: pathToFileURL(file_in_editor('src/lib/count.ts')).href, source: 'export function count(words: string[]): number {\n\treturn words.length\n}\n' }
		await compile_untested(entry)

		expect(entry.source).not.toContain(': number')
		expect(entry.sourceMap).toMatchObject({ sources: [file_in_editor('src/lib/count.ts')] })
	})

	it('compiles a Svelte component, with an absolute path to the original in its map', async () => {
		const entry: { url: string, source: string, sourceMap?: unknown } = { url: pathToFileURL(file_in_editor('src/lib/Verse.svelte')).href, source: '<script lang="ts">\n\tlet { text }: { text: string } = $props()\n</script>\n\n<p>{text}</p>\n' }
		await compile_untested(entry)

		expect(entry.source).not.toContain('<script')
		expect(entry.sourceMap).toMatchObject({ sources: [file_in_editor('src/lib/Verse.svelte')] })
	})

	it('leaves plain JavaScript alone', async () => {
		const url = pathToFileURL(file_in_editor('src/lib/env.js')).href
		const entry = { url, source: 'export const MODE = "test"\n' }
		await compile_untested(entry)
		expect(entry).toEqual({ url, source: 'export const MODE = "test"\n' })
	})
})
