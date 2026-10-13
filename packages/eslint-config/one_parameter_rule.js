// A function takes one parameter, and several values go in as one destructured object, so calls
// name what they pass. The exception is a named function handed straight to another call as its
// callback (`items.map(add_trace)`, `items.reduce(merge, {})`): its parameters are whatever shape
// that API dictates, so wrapping it in a lambda only to name them would hide the callback.
// Inline callbacks and object methods are never flagged for the same reason.
function is_passed_as_callback({ variable }) {
	return variable.references.some(({ identifier }) => {
		const { parent } = identifier
		return parent.type === 'CallExpression' && parent.arguments.includes(identifier)
	})
}

export const one_parameter_rule = {
	meta: {
		type: 'suggestion',
		schema: [],
		messages: {
			one_parameter: 'Take one object parameter, destructured, rather than several.',
		},
	},
	create(context) {
		function check({ node, declaration }) {
			if (node.params.length <= 1) return
			const [variable] = context.sourceCode.getDeclaredVariables(declaration)
			if (variable && is_passed_as_callback({ variable })) return
			context.report({ node, messageId: 'one_parameter' })
		}

		return {
			FunctionDeclaration(node) {
				check({ node, declaration: node })
			},
			'VariableDeclarator > :matches(ArrowFunctionExpression, FunctionExpression)'(node) {
				check({ node, declaration: node.parent })
			},
			// A method is reached as `this.method` or `object.method`, never as a bare identifier.
			'MethodDefinition > FunctionExpression'(node) {
				if (node.params.length > 1) context.report({ node, messageId: 'one_parameter' })
			},
		}
	},
}
