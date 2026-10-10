import { describe, expect, it } from 'bun:test'
import { extract_shell_commands, find_undeclared_bin_deps } from './check_missing_bin_deps'

describe('Undeclared CLI Dependency Checker', () => {
	describe('extract_shell_commands', () => {
		it('captures the command name from a Bun `$` tagged template', () => {
			const content = 'await $`wrangler d1 export ${db_name} --output ${dump_filename} --remote`'
			const usages = extract_shell_commands(content)
			expect(usages).toEqual([{ line_number: 1, command: 'wrangler' }])
		})

		it('reports the correct line number for later matches', () => {
			const content = [
				'const x = 1',
				'await $`tsc --noEmit`',
			].join('\n')
			const usages = extract_shell_commands(content)
			expect(usages).toEqual([{ line_number: 2, command: 'tsc' }])
		})

		it('ignores plain string literals and unrelated code', () => {
			const content = "const msg = 'wrangler is great'\nconsole.log(msg)"
			expect(extract_shell_commands(content)).toEqual([])
		})

		it('finds multiple commands across multiple lines', () => {
			const content = [
				'await $`wrangler d1 list`.text()',
				'await $`wrangler r2 object put foo --file bar`',
			].join('\n')
			const usages = extract_shell_commands(content)
			expect(usages.map(u => u.command)).toEqual(['wrangler', 'wrangler'])
			expect(usages.map(u => u.line_number)).toEqual([1, 2])
		})
	})

	describe('find_undeclared_bin_deps', () => {
		const pkg = { name: 'tools/databases' }

		it('flags a known CLI command missing from declared dependencies', () => {
			const content = 'await $`wrangler d1 list`.text()'
			const findings = find_undeclared_bin_deps({ pkg, file_path: 'index.ts', content, declared: new Set() })
			expect(findings.length).toBe(1)
			expect(findings[0].command).toBe('wrangler')
			expect(findings[0].expected_package).toBe('wrangler')
			expect(findings[0].package_name).toBe('tools/databases')
		})

		it('does not flag a command whose package is already declared', () => {
			const content = 'await $`wrangler d1 list`.text()'
			const findings = find_undeclared_bin_deps({ pkg, file_path: 'index.ts', content, declared: new Set(['wrangler']) })
			expect(findings).toEqual([])
		})

		it('ignores shell commands that are not in the known bin/package map', () => {
			const content = 'await $`rm -rf ./dist`'
			const findings = find_undeclared_bin_deps({ pkg, file_path: 'index.ts', content, declared: new Set() })
			expect(findings).toEqual([])
		})
	})
})
