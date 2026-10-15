// A string that contains an apostrophe isn't escaped: "Copilot's brief", not 'Copilot\'s brief',
// and `He said "don't"` when it holds both kinds of quote. `@stylistic/quotes`' `avoidEscape`
// options only allow these forms; they never flag the escape. A string that also holds a backtick
// or `${` keeps its single quotes, since escaping something is then unavoidable.
function unescaped({ inside, value }) {
	const text = inside.replaceAll("\\'", "'")
	if (!value.includes('"')) return `"${text}"`
	if (!value.includes('`') && !value.includes('${')) return `\`${text}\``
	return null
}

export const no_escaped_quote_rule = {
	meta: {
		type: 'layout',
		fixable: 'code',
		schema: [],
		messages: {
			no_escaped_quote: 'Use double quotes (or backticks, if it also holds a double quote) instead of escaping an apostrophe.',
		},
	},
	create(context) {
		return {
			Literal(node) {
				if (typeof node.value !== 'string' || !node.raw.startsWith("'")) return
				const inside = node.raw.slice(1, -1)
				if (!inside.includes("\\'")) return

				const replacement = unescaped({ inside, value: node.value })
				if (!replacement) return
				context.report({ node, messageId: 'no_escaped_quote', fix: fixer => fixer.replaceText(node, replacement) })
			},
		}
	},
}
