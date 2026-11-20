<script lang="ts">
	import { Footer } from '#lib/index.js'
	import SidebarContainer from '#lib/SidebarContainer.svelte'
	import type { LayoutProps } from './$types'

	let { data, children }: LayoutProps = $props()

	let nav_data = $derived(data.nav_data)
	let current = $derived(nav_data.current)
</script>

<svelte:head>
	<title>Edit {current.id_primary} {current.id_secondary}:{current.id_tertiary} - TaBiThA Sources</title>
</svelte:head>

<SidebarContainer>
	{#if children}
		{@render children()}
	{/if}
	
	<Footer />
</SidebarContainer>