<script lang="ts">
	import type { CheckerToken } from '@tabitha/types'
	import type { Component as SvelteComponent } from 'svelte'
	import LookupWord from './LookupWord.svelte'
	import Added from './Added.svelte'
	import AutoFixed from './AutoFixed.svelte'
	import SingleToken from './SingleToken.svelte'
	import Clause from './Clause.svelte'
	import { TOKEN_TYPE } from '#lib/token.js'

	let { tokens }: { tokens: CheckerToken[] } = $props()

	const component_map = new Map<string, SvelteComponent<{ token: CheckerToken }>>([
		[TOKEN_TYPE.CLAUSE, Clause],
		[TOKEN_TYPE.FUNCTION_WORD, SingleToken],
		[TOKEN_TYPE.NOTE, SingleToken],
		[TOKEN_TYPE.PUNCTUATION, SingleToken],
		[TOKEN_TYPE.LOOKUP_WORD, LookupWord],
		[TOKEN_TYPE.ADDED, Added],
	])
</script>

{#each tokens as token}
	{@const Component = component_map.get(token.type)}
	{#if token.auto_fix}
		<AutoFixed {token} auto_fix={token.auto_fix} />
	{:else if Component}
		<Component {token} />
	{/if}
{/each}
