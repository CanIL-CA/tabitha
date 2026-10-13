import { beforeEach, describe, expect, it } from 'bun:test'
import { check_tabs_indentation } from './tabs_indentation'
import { findings } from './types'

function check(content: string) {
	check_tabs_indentation({ file_path: '/apps/test/test.ts', lines: content.split('\n') })
	return findings
}

describe('check_tabs_indentation', () => {
	beforeEach(() => {
		findings.length = 0
	})

	it('flags a line indented with spaces', () => {
		const result = check('function foo() {\n  return 1\n}')
		expect(result.length).toBe(1)
		expect(result[0].rule_id).toBe(3)
		expect(result[0].message).toContain('2 spaces')
	})

	it('does not flag a tab-indented line', () => {
		const result = check('function foo() {\n\treturn 1\n}')
		expect(result.length).toBe(0)
	})

	it('does not flag prose inside a multi-line template literal, even if space-indented', () => {
		const result = check([
			'const prompt = `',
			'  this line looks indented but is just prose',
			'`',
		].join('\n'))
		expect(result.length).toBe(0)
	})

	it('does not flag content inside an HTML comment', () => {
		const result = check([
			'<!-- a note',
			'  indented prose inside the comment',
			'-->',
		].join('\n'))
		expect(result.length).toBe(0)
	})

	it('still flags a space-indented line that comes after a closed template literal', () => {
		const result = check([
			'const prompt = `hello`',
			'  const after = 1',
		].join('\n'))
		expect(result.length).toBe(1)
	})
})
