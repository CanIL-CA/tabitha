import { describe, expect, it } from 'bun:test'
import { percent, vitest_workspaces, workspace_of } from './coverage_summary'

const ROOT = '/repo'

describe('vitest_workspaces', () => {
	it('keeps only workspaces whose unit tests run under Vitest', () => {
		expect(vitest_workspaces([
			{ dir: 'packages/ui', scripts: { 'test:unit': 'vitest run src' } },
			{ dir: 'apps/editor', scripts: { 'test:unit': 'vitest run src' } },
			{ dir: 'tools/dns', scripts: { 'test:unit': 'bun test' } },
			{ dir: 'apps/www', scripts: { build: 'vite build' } },
			{ dir: 'packages/tsconfig' },
		])).toEqual(['apps/editor', 'packages/ui'])
	})
})

describe('workspace_of', () => {
	it('names the app or package a file belongs to', () => {
		expect(workspace_of({ root_dir: ROOT, file: '/repo/apps/editor/src/lib/parser.ts' })).toBe('apps/editor')
		expect(workspace_of({ root_dir: ROOT, file: '/repo/packages/ui/src/Footer.svelte' })).toBe('packages/ui')
	})

	it('ignores files outside apps/ and packages/', () => {
		expect(workspace_of({ root_dir: ROOT, file: '/repo/scripts/ci/plan.ts' })).toBeNull()
		expect(workspace_of({ root_dir: ROOT, file: '/repo/apps' })).toBeNull()
	})
})

describe('percent', () => {
	it('is null when there is nothing to cover', () => {
		expect(percent({ covered: 0, total: 0 })).toBeNull()
		expect(percent({ covered: 1, total: 4 })).toBe(25)
	})
})
