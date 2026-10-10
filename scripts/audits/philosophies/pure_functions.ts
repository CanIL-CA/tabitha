import { findings, SVELTEKIT_FRAMEWORK_EXEMPTIONS } from './types'

function split_top_level_params(params_raw: string): string[] {
	// Splits a parameter list on top-level commas only, tracking nested (), {}, [], <> so
	// generics, destructured objects, and default-value calls don't get split mid-expression.
	const params: string[] = []
	let depth = 0
	let current = ''
	for (const char of params_raw) {
		if (char === '(' || char === '{' || char === '[' || char === '<') depth++
		else if (char === ')' || char === '}' || char === ']' || char === '>') depth--
		if (char === ',' && depth === 0) {
			params.push(current.trim())
			current = ''
		} else {
			current += char
		}
	}
	if (current.trim()) params.push(current.trim())
	return params
}

function extract_matching_brace_body({ content, start_index }: {
	content: string
	start_index: number
}): string | null {
	let idx = start_index
	while (idx < content.length && /\s/.test(content[idx])) idx++
	if (content[idx] !== '{') return null

	let depth = 0
	const body_start = idx
	for (; idx < content.length; idx++) {
		if (content[idx] === '{') depth++
		else if (content[idx] === '}') {
			depth--
			if (depth === 0) return content.slice(body_start, idx + 1)
		}
	}
	return content.slice(body_start)
}

const BOOLEAN_PARAM_PATTERN = /^([a-zA-Z_][a-zA-Z0-9_]*)\??\s*:\s*boolean\b/

function references_param_in_conditional({ body, param_name }: {
	body: string
	param_name: string
}): boolean {
	const escaped = param_name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const conditional_patterns = [
		new RegExp(`\\b(if|while)\\s*\\([^)]*\\b${escaped}\\b`),
		new RegExp(`\\b${escaped}\\b\\s*\\?[^:?]*:`),
		new RegExp(`(&&|\\|\\|)\\s*${escaped}\\b`),
		new RegExp(`\\b${escaped}\\b\\s*(&&|\\|\\|)`),
	]
	return conditional_patterns.some(p => p.test(body))
}

const FUNCTION_SIGNATURE_PATTERN =
	/(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?:<[^)]*>)?\s*\(([^)]*)\)|(?:export\s+)?(?:const|let)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:<[^)]*>)?\(([^)]*)\)\s*(?::[^=>{]+)?=>/g

// Standard-library iteration/sort methods whose callback signature is fixed by the
// language spec, not chosen by us (e.g. a sort comparator must take (a, b)). A named
// function passed *by reference* to one of these is fulfilling an external contract we
// don't control, so it's exempt from Philosophy 11 -- to add another such contract
// (a different native/web/framework API with a fixed multi-arg callback shape), add its
// method name here rather than special-casing individual function names.
const NATIVE_CALLBACK_METHODS = [
	'sort',
	'toSorted',
	'reduce',
	'reduceRight',
	'map',
	'filter',
	'forEach',
	'some',
	'every',
	'find',
	'findIndex',
	'findLast',
	'findLastIndex',
	'flatMap',
]
const NATIVE_CALLBACK_REF_PATTERN = new RegExp(
	`\\.(?:${NATIVE_CALLBACK_METHODS.join('|')})\\(\\s*([a-zA-Z_][a-zA-Z0-9_]*)\\s*[,)]`,
	'g',
)
// Array.from(iterable, mapFn) passes its map function as a second positional argument
// rather than through a method call on the function's own name.
const ARRAY_FROM_CALLBACK_REF_PATTERN = /Array\.from\([^,]*,\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\)/g

// Scans the whole codebase (not just the file defining a candidate function) because an
// exported helper is typically defined in one module and passed as a bare callback from
// another.
export function find_native_callback_names(all_content: string[]): Set<string> {
	const names = new Set<string>()
	for (const content of all_content) {
		for (const pattern of [NATIVE_CALLBACK_REF_PATTERN, ARRAY_FROM_CALLBACK_REF_PATTERN]) {
			const regex = new RegExp(pattern.source, pattern.flags)
			let match: RegExpExecArray | null
			while ((match = regex.exec(content)) !== null) names.add(match[1])
		}
	}
	return names
}

export function check_pure_functions({ file_path, content, native_callback_names }: {
	file_path: string
	content: string
	native_callback_names: Set<string>
}) {
	// Philosophy 11: Pure functions -- avoid boolean "flag" parameters that branch a function's
	// behavior. The one-argument half is enforced by ESLint (`no-restricted-syntax` in
	// @tabitha/eslint-config), which reads the AST rather than guessing from a regex.
	if (!file_path.endsWith('.ts') && !file_path.endsWith('.svelte')) return

	const regex = new RegExp(FUNCTION_SIGNATURE_PATTERN)
	let match

	while ((match = regex.exec(content)) !== null) {
		const name = match[1] || match[3]
		const params_raw = (match[2] ?? match[4] ?? '').trim()
		if (!name || SVELTEKIT_FRAMEWORK_EXEMPTIONS.has(name) || native_callback_names.has(name) || !params_raw) continue

		const params = split_top_level_params(params_raw)
		const line_number = content.substring(0, match.index).split('\n').length
		const snippet = `${name}(${params_raw.replace(/\s+/g, ' ')})`.slice(0, 100)

		const search_start = match.index + match[0].length
		const body =
			extract_matching_brace_body({ content, start_index: search_start }) ?? content.slice(search_start, search_start + 400)

		for (const param of params) {
			const bool_match = param.match(BOOLEAN_PARAM_PATTERN)
			if (!bool_match) continue

			const param_name = bool_match[1]
			if (references_param_in_conditional({ body, param_name })) {
				findings.push({
					rule_id: 11,
					rule_title: 'Pure functions',
					file_path,
					line_number,
					snippet,
					message: `Function "${name}" has boolean parameter "${param_name}" that drives conditional logic in its body. Split into separate, single-purpose functions instead of branching on a flag argument.`,
				})
				break
			}
		}
	}
}
