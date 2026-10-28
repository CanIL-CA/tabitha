import { afterEach, describe, expect, it } from 'bun:test'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { file_layers } from './coverage_layers'
import { generate_e2e_coverage, is_reported_source, read_unit_coverage } from './monocart_report'

const ROOT = resolve('/repo')
const WORKSPACES = ['apps/editor', 'packages/ui']

describe('is_reported_source', () => {
	it("counts a Vitest workspace's own source files", () => {
		for (const file of [join(ROOT, 'apps/editor/src/lib/parser/index.ts'), join(ROOT, 'apps/editor/src/routes/+page.svelte'), join(ROOT, 'packages/ui/src/theme.svelte.ts')]) {
			expect(is_reported_source({ root_dir: ROOT, workspaces: WORKSPACES, file })).toBe(true)
		}
	})

	it('leaves out tests, type declarations, generated messages and styles', () => {
		for (const file of [join(ROOT, 'apps/editor/src/lib/check.test.ts'), join(ROOT, 'apps/editor/src/app.d.ts'), join(ROOT, 'apps/editor/src/lib/paraglide/messages.js'), join(ROOT, 'apps/editor/src/lib/app.css')]) {
			expect(is_reported_source({ root_dir: ROOT, workspaces: WORKSPACES, file })).toBe(false)
		}
	})

	it('leaves out files outside src/ and workspaces that are not Vitest workspaces', () => {
		for (const file of [join(ROOT, 'apps/editor/e2e/editor.spec.ts'), join(ROOT, 'apps/editor/vite.config.ts'), join(ROOT, 'apps/www/src/routes/+page.svelte'), join(ROOT, 'node_modules/svelte/src/index.js')]) {
			expect(is_reported_source({ root_dir: ROOT, workspaces: WORKSPACES, file })).toBe(false)
		}
	})
})

describe('read_unit_coverage', () => {
	let root_dir = ''
	afterEach(async () => {
		await rm(root_dir, { recursive: true, force: true })
	})

	async function write_report({ workspace, name, report }: { workspace: string, name: string, report: unknown }) {
		const dir = join(root_dir, workspace, 'coverage', 'unit')
		await mkdir(dir, { recursive: true })
		await writeFile(join(dir, name), JSON.stringify(report))
	}

	it("joins every workspace's reports, keyed by absolute path, without the totals", async () => {
		root_dir = await mkdtemp(join(tmpdir(), 'unit-coverage-'))
		const counts = { total: 2, covered: 1 }
		const file_summary = { lines: counts, statements: counts, branches: counts, functions: counts }
		const file_coverage = { statementMap: { 0: { start: { line: 1 } } }, s: { 0: 1 } }
		await write_report({ workspace: 'apps/editor', name: 'coverage-summary.json', report: { 'total': file_summary, 'src/lib/check.ts': file_summary } })
		await write_report({ workspace: 'apps/editor', name: 'coverage-final.json', report: { 'src/lib/check.ts': file_coverage } })
		await write_report({ workspace: 'packages/ui', name: 'coverage-summary.json', report: { 'total': file_summary, 'src/lib/check.ts': file_summary } })

		const { summary, files } = await read_unit_coverage({ root_dir, workspaces: WORKSPACES })

		expect(Object.keys(summary).sort()).toEqual([join(root_dir, 'apps/editor/src/lib/check.ts'), join(root_dir, 'packages/ui/src/lib/check.ts')])
		expect(files).toEqual({ [join(root_dir, 'apps/editor/src/lib/check.ts')]: file_coverage })
	})

	it('returns empty reports for workspaces that wrote none', async () => {
		root_dir = await mkdtemp(join(tmpdir(), 'unit-coverage-'))
		expect(await read_unit_coverage({ root_dir, workspaces: WORKSPACES })).toEqual({ summary: {}, files: {} })
	})
})

describe('generate_e2e_coverage', () => {
	let root_dir = ''
	afterEach(async () => {
		await rm(root_dir, { recursive: true, force: true })
	})

	it("counts the lines an app's dev server ran, which the browser can't see", async () => {
		root_dir = await mkdtemp(join(tmpdir(), 'e2e-coverage-'))
		const source = 'export function ran() {\n\treturn 1\n}\n\nexport function skipped() {\n\treturn 2\n}\n'
		const file = join(root_dir, 'apps/editor/src/lib/server/check.ts')
		await mkdir(join(root_dir, 'apps/editor/src/lib/server'), { recursive: true })
		await writeFile(file, source)
		const server_dir = join(root_dir, 'apps/editor/coverage/e2e-server')
		await mkdir(server_dir, { recursive: true })
		const ranges = (count: number, text: string) => [{ startOffset: source.indexOf(text), endOffset: source.indexOf(text) + text.length, count }]
		const functions = [
			{ functionName: '', isBlockCoverage: true, ranges: [{ startOffset: 0, endOffset: source.length, count: 1 }] },
			{ functionName: 'ran', isBlockCoverage: true, ranges: ranges(1, 'function ran() {\n\treturn 1\n}') },
			{ functionName: 'skipped', isBlockCoverage: true, ranges: ranges(0, 'function skipped() {\n\treturn 2\n}') },
		]
		await writeFile(join(server_dir, '123.json'), JSON.stringify([{ url: pathToFileURL(file).href, source, functions }]))

		const report = await generate_e2e_coverage({ root_dir, workspaces: ['apps/editor'], output_dir: join(root_dir, 'layers/e2e') })

		const { total, e2e } = file_layers({ e2e: report[file] })
		expect(report[file]).toBeDefined()
		expect(e2e).toBeGreaterThan(0)
		expect(e2e).toBeLessThan(total)
	})

	it('returns an empty report when no app recorded anything', async () => {
		root_dir = await mkdtemp(join(tmpdir(), 'e2e-coverage-'))
		expect(await generate_e2e_coverage({ root_dir, workspaces: ['apps/editor'], output_dir: join(root_dir, 'layers/e2e') })).toEqual({})
	})
})
