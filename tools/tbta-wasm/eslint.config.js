import tabithaConfig from '@tabitha/eslint-config'

export default [
	...tabithaConfig,
	{ ignores: ['.tbta/**', '.downloads/**'] },

	// A CLI run directly by a developer, so console output is the product.
	{
		rules: {
			'no-console': 'off',
		},
	},
]
