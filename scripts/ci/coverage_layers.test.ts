import { describe, expect, it } from 'bun:test'
import { file_layers, layers_by_workspace, layers_markdown, type FileCoverage } from './coverage_layers'

const ROOT = '/repo'

/** A file whose statements start on `lines`, with `ran` listing the lines whose statements ran. */
function file_coverage({ lines, ran }: { lines: number[], ran: number[] }): FileCoverage {
	return {
		statementMap: Object.fromEntries(lines.map((line, index) => [String(index), { start: { line } }])),
		s: Object.fromEntries(lines.map((line, index) => [String(index), ran.includes(line) ? 1 : 0])),
	}
}

describe('file_layers', () => {
	it('counts lines run by either layer as the union and by both as the intersection', () => {
		expect(file_layers({
			unit: file_coverage({ lines: [1, 2, 3, 4], ran: [1, 2] }),
			e2e: file_coverage({ lines: [1, 2, 3, 4], ran: [2, 3] }),
		})).toEqual({ total: 4, unit: 2, e2e: 2, union: 3, both: 1 })
	})

	it('counts a line once, as covered when any statement on it ran', () => {
		const one_line_two_statements: FileCoverage = {
			statementMap: { 0: { start: { line: 7 } }, 1: { start: { line: 7 } } },
			s: { 0: 0, 1: 3 },
		}
		expect(file_layers({ unit: one_line_two_statements })).toEqual({ total: 1, unit: 1, e2e: 0, union: 1, both: 0 })
	})

	it('treats a file only one layer reports as uncovered by the other', () => {
		expect(file_layers({ e2e: file_coverage({ lines: [1, 2], ran: [1] }) })).toEqual({ total: 2, unit: 0, e2e: 1, union: 1, both: 0 })
	})

	it('keeps a line only one layer can see in the total', () => {
		expect(file_layers({
			unit: file_coverage({ lines: [1, 2], ran: [1, 2] }),
			e2e: file_coverage({ lines: [1, 2, 3], ran: [3] }),
		})).toEqual({ total: 3, unit: 2, e2e: 1, union: 3, both: 0 })
	})
})

describe('layers_by_workspace', () => {
	it("sums each workspace's files, whichever layer reports them", () => {
		const layers = layers_by_workspace({
			root_dir: ROOT,
			unit: {
				'/repo/apps/editor/src/a.ts': file_coverage({ lines: [1, 2], ran: [1] }),
				'/repo/packages/ui/src/Footer.svelte': file_coverage({ lines: [1], ran: [] }),
			},
			e2e: {
				'/repo/apps/editor/src/a.ts': file_coverage({ lines: [1, 2], ran: [2] }),
				'/repo/apps/editor/src/routes/+page.svelte': file_coverage({ lines: [1, 2], ran: [1, 2] }),
				'/repo/packages/ui/src/Footer.svelte': file_coverage({ lines: [1], ran: [1] }),
			},
		})

		expect(layers).toEqual([
			{ workspace: 'apps/editor', total: 4, unit: 1, e2e: 3, union: 4, both: 0 },
			{ workspace: 'packages/ui', total: 1, unit: 0, e2e: 1, union: 1, both: 0 },
		])
	})

	it('ignores files outside apps/ and packages/', () => {
		expect(layers_by_workspace({ root_dir: ROOT, unit: { '/repo/scripts/ci/plan.ts': file_coverage({ lines: [1], ran: [1] }) }, e2e: {} })).toEqual([])
	})
})

describe('layers_markdown', () => {
	it("shows each workspace's union, unit, e2e and both shares", () => {
		const markdown = layers_markdown({ layers: [{ workspace: 'apps/editor', total: 8, unit: 4, e2e: 2, union: 5, both: 1 }] })
		expect(markdown).toContain('| `apps/editor` | 62.5% | 50.0% | 25.0% | 12.5% |')
	})

	it('shows n/a for a workspace with no lines to cover', () => {
		const markdown = layers_markdown({ layers: [{ workspace: 'packages/types', total: 0, unit: 0, e2e: 0, union: 0, both: 0 }] })
		expect(markdown).toContain('| `packages/types` | n/a | n/a | n/a | n/a |')
	})
})
