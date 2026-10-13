import { findings, SVELTEKIT_FRAMEWORK_EXEMPTIONS } from './types'

export function check_snake_case_functions({ file_path, lines }: {
	file_path: string
	lines: string[]
}) {
	// Philosophy 10: snake_case for functions and variables
	lines.forEach((line, idx) => {
		const trimmed = line.trim()
		if (trimmed.startsWith('//') || trimmed.startsWith('*')) return

		// Match function declaration: function camelCase(
		const func_decl_match = trimmed.match(/\bfunction\s+([a-z]+[A-Z][a-zA-Z0-9]*)\s*\(/)
		// Match const fn = (...) => or const fn = function
		const const_fn_match = trimmed.match(/\b(?:const|let)\s+([a-z]+[A-Z][a-zA-Z0-9]*)\s*=\s*(?:\([^)]*\)|[a-zA-Z0-9_]+)\s*=>/)

		const camel_name = func_decl_match?.[1] || const_fn_match?.[1]
		if (camel_name) {
			if (SVELTEKIT_FRAMEWORK_EXEMPTIONS.has(camel_name)) return
			findings.push({
				rule_id: 10,
				rule_title: 'snake_case for functions and variables',
				file_path,
				line_number: idx + 1,
				snippet: trimmed,
				message: `Function "${camel_name}" uses camelCase. Prefer snake_case naming.`,
			})
		}
	})
}
