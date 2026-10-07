import { describe, expect, it } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AUDITS } from './registry'
import { format_summary, has_blocking_failure, type AuditResult } from './run'

const root_dir = resolve(fileURLToPath(new URL('.', import.meta.url)), '../..')

function result(script: string, blocking: boolean, outcome: AuditResult['outcome']): AuditResult {
	return { script, label: script, blocking, outcome }
}

describe('has_blocking_failure', () => {
	it('ignores a failing advisory audit', () => {
		expect(has_blocking_failure([result('check:md', false, 'failure'), result('check:secrets', true, 'success')])).toBe(false)
	})

	it('fails on a failing blocking audit', () => {
		expect(has_blocking_failure([result('check:md', false, 'success'), result('check:secrets', true, 'failure')])).toBe(true)
	})
})

describe('format_summary', () => {
	it('marks advisory failures ⚠️ and blocking failures ❌', () => {
		const summary = format_summary([
			result('check:secrets', true, 'failure'),
			result('check:md', false, 'failure'),
			result('check:badges', false, 'success'),
		])
		expect(summary).toContain('❌ check:secrets (blocking)')
		expect(summary).toContain('⚠️ check:md')
		expect(summary).toContain('✅ check:badges')
		expect(summary).toContain('2 of 3 audits failed.')
	})
})

// These keep the registry the single list of audits: local runs, CI and the PR summary all read it.
describe('audit registry', () => {
	it('registers each audit once', () => {
		const scripts = AUDITS.map(a => a.script)
		expect(new Set(scripts).size).toBe(scripts.length)
	})

	it('names only scripts that exist in the root package.json', async () => {
		const { scripts } = JSON.parse(await readFile(resolve(root_dir, 'package.json'), 'utf-8'))
		const missing = AUDITS.filter(a => !(a.script in scripts)).map(a => a.script)
		expect(missing).toEqual([])
	})

	it('includes every check:* script that runs a scripts/audits/ checker', async () => {
		const { scripts } = JSON.parse(await readFile(resolve(root_dir, 'package.json'), 'utf-8'))
		const registered = new Set(AUDITS.map(a => a.script))
		const unregistered = Object.entries<string>(scripts)
			.filter(([name, command]) => name.startsWith('check:') && command.includes('scripts/audits/check_'))
			.map(([name]) => name)
			.filter(name => !registered.has(name))
		expect(unregistered).toEqual([])
	})

	it('is the only way ci.yml runs an audit', async () => {
		const ci = await readFile(resolve(root_dir, '.github/workflows/ci.yml'), 'utf-8')
		const direct = AUDITS.filter(a => new RegExp(`bun run ${a.script}(?![\\w:-])`).test(ci)).map(a => a.script)
		expect(direct).toEqual([])
		expect(ci).toContain('bun run check:audits')
	})
})
