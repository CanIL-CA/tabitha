import js from '@eslint/js'
import stylistic from '@stylistic/eslint-plugin'
import globals from 'globals'
import import_x from 'eslint-plugin-import-x'
import svelte from 'eslint-plugin-svelte'
import svelte_parser from 'svelte-eslint-parser'
import ts from 'typescript-eslint'
import { includeIgnoreFile } from '@eslint/compat'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root_gitignore_path = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.gitignore')

// Shared base rules for JavaScript & TypeScript
export const baseConfig = [
	js.configs.recommended,
	...ts.configs.recommended,

	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},

		plugins: {
			'@stylistic': stylistic,
			'import-x': import_x,
		},

		rules: {
			'@typescript-eslint/consistent-generic-constructors': ['error', 'constructor'],
			'@typescript-eslint/consistent-type-imports': [
				'error',
				{ prefer: 'type-imports', fixStyle: 'separate-type-imports', disallowTypeAnnotations: false },
			],
			'import-x/no-duplicates': ['error', { 'prefer-inline': true }],
			'@typescript-eslint/consistent-type-definitions': ['error', 'type'],
			// `import { type A, type B }` becomes `import type { A, B }`; a mix of values and types is left alone.
			'@typescript-eslint/no-import-type-side-effects': 'error',
			'@stylistic/semi': ['error', 'never'],
			'@stylistic/indent': ['error', 'tab'],
			'@stylistic/quotes': [
				'error',
				'single',
				{
					avoidEscape: true,
				},
			],
			'@stylistic/arrow-parens': ['error', 'as-needed'],
			'@stylistic/comma-dangle': ['error', 'always-multiline'],
			'eqeqeq': 'error',
			'no-console': [
				'warn',
				{
					allow: [
						'error',
						'info',
						'warn',
					],
				},
			],
			'@stylistic/no-extra-parens': 'error',
			'@stylistic/object-curly-spacing': ['error', 'always'],
			'no-undef': 'off',
			// Every unused parameter, not only those after the last one used. A leading `_` marks one an API's
			// callback shape makes us take but we don't need, like `Array.from`'s value before its index.
			'@typescript-eslint/no-unused-vars': ['error', { args: 'all', argsIgnorePattern: '^_' }],
			// A function takes one parameter, and several values go in as one destructured object, so calls
			// name what they pass. Only named functions and class methods are held to it: an inline callback
			// or object method has the shape its API gives it (a sort comparator, `reduce`, a Vite hook).
			'no-restricted-syntax': [
				'error',
				...[
					'FunctionDeclaration[params.length>1]',
					'VariableDeclarator > :matches(ArrowFunctionExpression, FunctionExpression)[params.length>1]',
					'MethodDefinition > FunctionExpression[params.length>1]',
				].map(selector => ({ selector, message: 'Take one object parameter, destructured, rather than several.' })),
			],
		},
	},

	// SvelteKit's ambient app.d.ts declares its App.Locals/Platform/etc. as `interface` so they
	// can merge with SvelteKit's own ambient declarations -- `type` can't do that merging.
	{
		files: ['**/app.d.ts'],
		rules: {
			'@typescript-eslint/consistent-type-definitions': 'off',
		},
	},
]

// Shared rules for Svelte 5 components
export const svelteConfig = [
	{
		files: [
			'src/**/*.svelte',
		],

		languageOptions: {
			parser: svelte_parser,
			parserOptions: {
				parser: ts.parser,
				extraFileExtensions: ['.svelte'],
				projectService: true,
			},
		},

		plugins: {
			svelte,
		},

		rules: {
			...svelte.configs.recommended.rules,
			'no-inner-declarations': 'off',
		},
	},
]

// Ignores for build artifacts, cache, and vendor directories -- derived from the repo's own
// .gitignore so the two never drift apart, plus committed-but-generated files that
// .gitignore doesn't (and shouldn't) cover.
export const ignoreConfig = [
	includeIgnoreFile(root_gitignore_path),
	{
		ignores: [
			'**/worker-configuration.d.ts',
		],
	},
]

export default [
	...ignoreConfig,
	...baseConfig,
	...svelteConfig,
]
