import type { CopilotEncodingEntity, EntityMatch, EntityMatchCapture, EntityMatchResult, FlagExtractionRule, IndexStack, PatternEntity } from '#lib/types.js'

/**
 * Check whether a value is a variable
 *
 * Variables begin with "$"
 */
function is_variable(value: unknown): value is string {
	return typeof value === 'string' && value.startsWith('$')
}

/**
 * Deep clone JSON-compatible data
 */
function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value))
}

/**
 * Resolve a variable through bindings
 */
function resolve_variable({ variable, bindings }: { variable: string, bindings: Record<string, unknown> }): unknown {
	let current: unknown = variable

	while (is_variable(current) && bindings[current] !== undefined && bindings[current] !== current) {
		current = bindings[current]
	}

	return current
}

/**
 * Compare two values recursively
 */
function match_value({ a, b, bindings = {} }: { a: unknown, b: unknown, bindings?: Record<string, unknown> }) {
	const local_bindings = clone(bindings)

	const result = match_value_internal({ actual: a, pattern: b, bindings: local_bindings })

	if (!result) {
		return null
	}

	return {
		success: result,
		bindings: local_bindings,
	}
}

/**
 * Internal recursive matching
 */
function match_value_internal({ actual, pattern, bindings }: { actual: unknown, pattern: unknown, bindings: Record<string, unknown> }): boolean {
	// resolve bound vars
	// There should be no variables in 'actual', but they can be in 'pattern'
	if (is_variable(pattern)) {
		const resolved = resolve_variable({ variable: pattern, bindings })

		if (resolved !== pattern) {
			return match_value_internal({ actual, pattern: resolved, bindings })
		}
	}

	if (is_variable(pattern)) {
		bindings[pattern] = actual
		return Boolean(actual)
	}

	// values can only be objects or strings
	// the only array would be 'children', which is handled separately

	if (actual === null || pattern === null || actual === undefined || pattern === undefined) {
		return actual === pattern
	}

	// strings
	if (typeof pattern === 'string') {
		const b_values = pattern.split('|').map(v => v.trim())
		return b_values.includes(String(actual))
	}

	// objects (pretty much only 'features')
	if (typeof pattern === 'object' && typeof actual === 'object') {
		const pattern_obj = pattern as Record<string, unknown>
		const actual_obj = actual as Record<string, unknown>
		for (const [key, pattern_value] of Object.entries(pattern_obj)) {
			if (!(key in actual_obj)) {
				return false
			}
			const value_match = match_value_internal({ actual: actual_obj[key], pattern: pattern_value, bindings })
			if (!value_match) {
				return false
			}
		}
		return true
	}

	return actual === pattern
}

/**
 * Check whether a node matches a structural pattern
 *
 * Supports:
 *	- recursive structure matching
 *	- variable unification
 *	- named captures
 */
function match_pattern_internal({ node, pattern, bindings = {}, captures = {}, stack = [] }: { node: CopilotEncodingEntity, pattern: PatternEntity, bindings?: Record<string, unknown>, captures?: Record<string, EntityMatchCapture>, stack?: IndexStack }): EntityMatch {
	const local_bindings = clone(bindings)
	const local_captures = clone(captures)

	// capture
	if (pattern.name) {
		local_captures[pattern.name] = {
			node,
			indexStack: stack,
		}
	}

	// check non-children properties
	for (const key of Object.keys(pattern) as (keyof CopilotEncodingEntity | keyof PatternEntity)[]) {
		if (key === 'children' || key === 'name' || key === 'optional') {
			continue
		}

		if (!(key in node)) {
			return { success: false, bindings, captures }
		}

		const result = match_value({ a: node[key], b: pattern[key], bindings: local_bindings })

		if (!result) {
			return { success: false, bindings, captures }
		}

		Object.assign(local_bindings, result.bindings)
	}

	// unordered child matching
	if (pattern.children) {
		if (!node.children) {
			return { success: false, bindings, captures }
		}

		const used_children = new Set()

		for (const child_pattern of pattern.children) {
			let matched = false

			for (let i = 0; i < node.children.length; i++) {
				if (used_children.has(i)) {
					continue
				}

				const child_node = node.children[i]

				const result = match_pattern_internal({ node: child_node, pattern: child_pattern, bindings: local_bindings, captures: local_captures, stack: [...stack, i] })

				if (result.success) {
					used_children.add(i)

					Object.assign(local_bindings, result.bindings)
					Object.assign(local_captures, result.captures)

					matched = true
					break
				}
			}

			if (!matched && !child_pattern.optional) {
				return { success: false, bindings, captures }
			}
		}
	}

	return { success: true, bindings: local_bindings, captures: local_captures }
}

export function get_matches({ root_entity, extractions }: { root_entity: CopilotEncodingEntity, extractions: FlagExtractionRule[] }): EntityMatchResult[] {
	function traverse_dfs({ node, stack = [] }: { node: CopilotEncodingEntity, stack?: IndexStack }): EntityMatchResult[] {
		const matches: EntityMatchResult[] = []

		for (const { flag, rules } of extractions) {
			for (const rule of rules) {
				const match = match_pattern_internal({ node, pattern: rule.pattern, bindings: {}, captures: {}, stack })
				if (match.success) {
					matches.push({ ...match, flag, rule })
					// Once a rule matches, don't check the other rules for the same flag
					continue
				}
			}
		}

		if (node.children) {
			for (let i = 0; i < node.children.length; i++) {
				matches.push(...traverse_dfs({ node: node.children[i], stack: [...stack, i] }))
			}
		}

		return matches
	}

	return traverse_dfs({ node: root_entity })
}

/**
 * Create a recursive tree matcher
 *
 * Searches entire structure DFS
 */
export function match_pattern({ pattern, root_entity }: { pattern: PatternEntity, root_entity: CopilotEncodingEntity }): EntityMatch[] {
	function traverse_dfs({ node, stack = [] }: { node: CopilotEncodingEntity, stack?: IndexStack }): EntityMatch[] {
		const matches: EntityMatch[] = []

		const result = match_pattern_internal({ node, pattern, bindings: {}, captures: {}, stack })
		if (result.success) {
			matches.push(result)
		}
		if (node.children) {
			for (let i = 0; i < node.children.length; i++) {
				matches.push(...traverse_dfs({ node: node.children[i], stack: [...stack, i] }))
			}
		}
		return matches
	}

	return traverse_dfs({ node: root_entity })
}
