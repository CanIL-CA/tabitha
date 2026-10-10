import { beforeEach, describe, expect, it } from 'bun:test'
import { check_strict_domain_typing } from './strict_domain_typing'
import { findings } from './types'

function check({ file_path, content }: {
	file_path: string
	content: string
}) {
	check_strict_domain_typing({ file_path, lines: content.split('\n') })
	return findings
}

describe('check_strict_domain_typing', () => {
	beforeEach(() => {
		findings.length = 0
	})

	it('flags an explicit ": any" type annotation', () => {
		const result = check({ file_path: '/apps/test/test.ts', content: 'function foo(x: any) {}' })
		expect(result.length).toBe(1)
		expect(result[0].rule_id).toBe(7)
		expect(result[0].message).toContain(': any')
	})

	it('flags an explicit "as any" cast', () => {
		const result = check({ file_path: '/apps/test/test.ts', content: 'const x = y as any' })
		expect(result.length).toBe(1)
		expect(result[0].message).toContain('as any')
	})

	it('does not flag ": any" when it is prose inside a multi-line template literal', () => {
		// Regression test: apps/copilot/src/lib/server/brief/prompts.ts is a real TypeScript
		// file whose entire body is LLM prompt text, and previously got a false-positive here
		// because this check scanned every line for the substring regardless of whether it was
		// inside a template literal.
		const result = check({ file_path: '/apps/test/prompts.ts', content: [
			'export const prompt = `',
			'- OUT (not in TNN): any theological claim the supplied TNN does not contain.',
			'`',
		].join('\n') })
		expect(result.length).toBe(0)
	})

	it('does not flag lines inside a comment', () => {
		const result = check({ file_path: '/apps/test/test.ts', content: '// legacy code used to take (x: any)' })
		expect(result.length).toBe(0)
	})

	it('only checks .ts and .svelte files', () => {
		const result = check({ file_path: '/apps/test/prompts.js', content: 'function foo(x: any) {}' })
		expect(result.length).toBe(0)
	})

	it('still flags real code that follows a closed template literal in the same file', () => {
		const result = check({ file_path: '/apps/test/prompts.ts', content: [
			'export const prompt = `',
			'some prose here',
			'`',
			'function foo(x: any) {}',
		].join('\n') })
		expect(result.length).toBe(1)
	})
})
