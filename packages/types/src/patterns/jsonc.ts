/**
 * Matches multi-line block comments (/* ... *\/). Not string-aware: it also matches inside a
 * string, so `strip_jsonc_comments` doesn't use it.
 *
 * @example
 * Positive: "/* config *\/", "/*\n * multi-line\n *\/"
 * Negative: "// single line", "url/path"
 */
export const BLOCK_COMMENT_REGEX = /\/\*[\s\S]*?\*\//g

/**
 * Matches single-line comments (// ...). Not string-aware: it also matches the `//` in a URL
 * string such as "http://localhost", so `strip_jsonc_comments` doesn't use it.
 *
 * @example
 * Positive: "// comment", "   // indented comment"
 * Negative: "path/to/file"
 */
export const LINE_COMMENT_REGEX = /\/\/.*$/gm

/**
 * Matches trailing commas before closing curly braces or square brackets. Not string-aware.
 *
 * @example
 * Positive: ", }" -> "}", ", ]" -> "]"
 * Negative: ", 'item'"
 */
export const TRAILING_COMMAS_REGEX = /,(\s*[}\]])/g

/**
 * Strips comments and trailing commas from a JSONC (JSON with Comments) string,
 * producing clean, standard JSON ready for `JSON.parse()`. Scans character by character so
 * anything inside a string -- a URL's `//`, a glob's `/*`, a literal `,}` -- is left alone.
 *
 * @param jsonc Raw JSON with Comments string
 * @returns Clean standard JSON string
 */
export function strip_jsonc_comments(jsonc: string): string {
	let output = ''
	let i = 0

	while (i < jsonc.length) {
		const char = jsonc[i]
		const next = jsonc[i + 1]

		if (char === '"') {
			const end = string_end({ text: jsonc, open: i })
			output += jsonc.slice(i, end)
			i = end
		} else if (char === '/' && next === '/') {
			const newline = jsonc.indexOf('\n', i)
			i = newline === -1 ? jsonc.length : newline
		} else if (char === '/' && next === '*') {
			const close = jsonc.indexOf('*/', i + 2)
			i = close === -1 ? jsonc.length : close + 2
		} else if (char === ',' && closes_after_whitespace({ text: jsonc, from: i + 1 })) {
			i++
		} else {
			output += char
			i++
		}
	}

	return output
}

/** Returns the index just past the closing quote of the string that opens at `open`. */
function string_end({ text, open }: {
	text: string
	open: number
}): number {
	for (let i = open + 1; i < text.length; i++) {
		if (text[i] === '\\') i++
		else if (text[i] === '"') return i + 1
	}
	return text.length
}

/** Whether the next non-whitespace, non-comment character from `from` is `}` or `]`. */
function closes_after_whitespace({ text, from }: {
	text: string
	from: number
}): boolean {
	let i = from
	while (i < text.length) {
		if (/\s/.test(text[i])) {
			i++
		} else if (text.startsWith('//', i)) {
			const newline = text.indexOf('\n', i)
			i = newline === -1 ? text.length : newline
		} else if (text.startsWith('/*', i)) {
			const close = text.indexOf('*/', i + 2)
			i = close === -1 ? text.length : close + 2
		} else {
			return text[i] === '}' || text[i] === ']'
		}
	}
	return false
}
