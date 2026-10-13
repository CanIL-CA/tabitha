import { beforeEach, describe, expect, it } from 'bun:test'
import { check_pure_functions } from './pure_functions'
import { findings } from './types'

function check({ content, native_callback_names = [] }: { content: string, native_callback_names?: string[] }) {
	check_pure_functions({ file_path: '/apps/test/test.ts', content, native_callback_names: new Set(native_callback_names) })
	return findings
}

describe('check_pure_functions: boolean flag parameters', () => {
	beforeEach(() => {
		findings.length = 0
	})

	it('flags a lone boolean parameter that the body branches on', () => {
		const result = check({ content: 'function render(compact: boolean) {\n\tif (compact) return 1\n\treturn 2\n}' })
		expect(result.length).toBe(1)
		expect(result[0].rule_id).toBe(11)
		expect(result[0].message).toContain('"compact"')
	})

	it('flags an arrow function with a lone boolean parameter used in a ternary', () => {
		const result = check({ content: 'const label = (active: boolean) => {\n\treturn active ? \'on\' : \'off\'\n}' })
		expect(result.length).toBe(1)
		expect(result[0].message).toContain('"label"')
	})

	it('flags an optional boolean parameter', () => {
		const result = check({ content: 'function render(compact?: boolean) {\n\tif (compact) return 1\n\treturn 2\n}' })
		expect(result.length).toBe(1)
	})

	it('does not flag a boolean parameter the body never branches on', () => {
		const result = check({ content: 'function wrap(done: boolean) {\n\treturn { done }\n}' })
		expect(result.length).toBe(0)
	})

	it('does not flag a boolean property inside a destructured options object', () => {
		const result = check({ content: 'function render({ items, compact }: { items: string[], compact: boolean }) {\n\tif (compact) return items\n\treturn []\n}' })
		expect(result.length).toBe(0)
	})

	it('does not flag a function dictated by a native callback API', () => {
		const result = check({
			content: 'function on_toggle(checked: boolean) {\n\tif (checked) return 1\n\treturn 2\n}',
			native_callback_names: ['on_toggle'],
		})
		expect(result.length).toBe(0)
	})

	it('does not flag SvelteKit-dictated exports', () => {
		const result = check({ content: 'export function load(flag: boolean) {\n\tif (flag) return 1\n\treturn 2\n}' })
		expect(result.length).toBe(0)
	})
})
