<script lang="ts">
	import { Header, Settings } from '#lib/index.js'
	import Navigation from '#lib/Navigation.svelte'
	import type { LayoutProps } from './$types'

	let { data, children }: LayoutProps = $props()

	let nav_data = $derived(data.nav_data)
	let current = $derived(nav_data.current)
</script>

<svelte:head>
	<title>Edit {current.id_primary} {current.id_secondary}:{current.id_tertiary} - TaBiThA Sources</title>
</svelte:head>

<Header>
	<div class="flex flex-wrap items-center gap-4">
		<Navigation nav_data={data.nav_data} url_end={'/edit'} />
		<Settings />
	</div>
</Header>

<main class="mx-8 mt-4">
	{#if children}
		{@render children()}
	{/if}
</main>