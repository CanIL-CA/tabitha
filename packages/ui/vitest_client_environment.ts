import type { Environment } from 'vitest/environments'

// Node, but with modules compiled for the browser: Svelte compiles $effect away in its server
// build, so rune tests that watch reactivity need the client one. No DOM, since none needs it yet.
export default {
	name: 'svelte-client',
	viteEnvironment: 'client',
	setup() {
		return { teardown() {} }
	},
} satisfies Environment
