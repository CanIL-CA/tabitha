<script lang="ts">
	import { Header, Settings } from '#lib/index.js'
	import Navigation from '#lib/Navigation.svelte'
	import { page } from '$app/state'
	import type { LayoutProps } from './$types'

	let { data, children }: LayoutProps = $props()

	let nav_data = $derived(data.nav_data)
	let current = $derived(nav_data.current)

	let is_edit = $derived(page.url.pathname.toLowerCase().endsWith('/edit'))
	let url_end = $derived(is_edit ? '/edit' : undefined)
</script>

<svelte:head>
	<title>{is_edit ? 'Edit ' : ''}{current.id_primary} {current.id_secondary}:{current.id_tertiary} - TaBiThA Sources</title>
</svelte:head>

<Header>
	<div class="flex flex-wrap gap-3">
		<Navigation nav_data={data.nav_data} {url_end}  />
		<Settings />
	</div>
</Header>

<main class="mx-8 mt-4">
	{#if children}
		{@render children()}
	{/if}
</main>