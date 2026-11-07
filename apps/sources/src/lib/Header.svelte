<script lang="ts">
	import { Header as HeaderBase } from '@tabitha/ui'
	import type { Snippet } from 'svelte'

	let { children }: { children?: Snippet } = $props()
</script>

<HeaderBase app="Sources">
	{#if children}
		{@render children()}
	{/if}
</HeaderBase>