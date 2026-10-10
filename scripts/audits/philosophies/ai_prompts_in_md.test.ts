import { beforeEach, describe, expect, it } from 'bun:test'
import { check_ai_prompts_in_md_files } from './ai_prompts_in_md'
import { findings } from './types'

function check(content: string) {
	check_ai_prompts_in_md_files({ file_path: '/apps/test/prompts.ts', content })
	return findings
}

describe('check_ai_prompts_in_md_files', () => {
	beforeEach(() => {
		findings.length = 0
	})

	it('flags a system_instruction authored as an inline multi-line template literal', () => {
		const result = check([
			'const system_instruction = `You are an expert.',
			'Follow these rules.`',
		].join('\n'))
		expect(result.length).toBe(1)
		expect(result[0].rule_id).toBe(15)
	})

	it('flags a build_system_instruction() function returning an inline template literal', () => {
		const result = check([
			'export function build_system_instruction(): string {',
			'\treturn `You are an expert.',
			'Follow these rules.`',
			'}',
		].join('\n'))
		expect(result.length).toBe(1)
	})

	it('does not flag a system_instruction sourced from an imported *.md?raw value', () => {
		const result = check([
			"import system_instruction from './prompt.md?raw'",
			'',
			'export function use() { return system_instruction }',
		].join('\n'))
		expect(result.length).toBe(0)
	})

	it('does not flag an unrelated multi-line template literal with no system_instruction nearby', () => {
		const result = check([
			'const sql = `SELECT *',
			'FROM concepts`',
		].join('\n'))
		expect(result.length).toBe(0)
	})

	it('does not flag a single-line system_instruction template literal', () => {
		const result = check('const system_instruction = `You are an expert.`')
		expect(result.length).toBe(0)
	})
})
