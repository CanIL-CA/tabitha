import tabithaConfig from '@tabitha/eslint-config'

export default [
	...tabithaConfig,

	// This is a CLI toolset run directly by a developer/operator, so console
	// output is the intended product rather than debug noise to be flagged.
	{
		rules: {
			'no-console': 'off',
		},
	},
]
