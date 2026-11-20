<script lang="ts">
	import { Header, Footer, Search } from '#lib/index.js'
	import type { Snippet } from 'svelte'

	let { children }: { children?: Snippet } = $props()
</script>

<Header>
	<div class="flex-1 min-w-64">
		<Search />
	</div>
</Header>

<main class="mx-8 mt-8">
	{#if children}
		{@render children()}
	{/if}
</main>

<Footer />