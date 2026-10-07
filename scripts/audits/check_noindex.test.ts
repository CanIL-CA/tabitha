import { describe, expect, it } from 'bun:test'
import { find_noindex_findings } from './check_noindex'

const WIRED_HOOKS = [
	"import { noindex_handle } from '@tabitha/noindex'",
	'export const handle = sequence(noindex_handle, cors_handle, rate_limit_handle)',
].join('\n')

function app(name: string, hooks_content: string | null) {
	return { name, hooks_path: `apps/${name}/src/hooks.server.ts`, hooks_content }
}

describe('find_noindex_findings', () => {
	it('passes a tool app that puts noindex_handle in its sequence', () => {
		expect(find_noindex_findings(app('sources', WIRED_HOOKS))).toEqual([])
	})

	it('warns about a tool app that never imports @tabitha/noindex', () => {
		const findings = find_noindex_findings(app('sources', 'export const handle = sequence(cors_handle)'))
		expect(findings.map(f => f.severity)).toEqual(['warning'])
	})

	it('warns about a tool app that imports noindex_handle but leaves it out of the sequence', () => {
		const hooks = "import { noindex_handle } from '@tabitha/noindex'\nexport const handle = sequence(cors_handle)"
		expect(find_noindex_findings(app('editor', hooks)).map(f => f.severity)).toEqual(['warning'])
	})

	it('warns about a tool app with no hooks.server.ts at all', () => {
		expect(find_noindex_findings(app('new-tool', null)).map(f => f.severity)).toEqual(['warning'])
	})

	it('passes the public site without noindex', () => {
		expect(find_noindex_findings(app('www', null))).toEqual([])
	})

	it('errors when the public site uses noindex', () => {
		expect(find_noindex_findings(app('www', WIRED_HOOKS)).map(f => f.severity)).toEqual(['error'])
	})
})
