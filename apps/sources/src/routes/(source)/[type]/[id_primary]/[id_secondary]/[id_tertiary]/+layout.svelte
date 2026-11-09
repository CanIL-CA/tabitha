<script lang="ts">
	import { Header, Footer, Settings } from '#lib/index.js'
	import Navigation from '#lib/Navigation.svelte'
	import SidebarContainer from '#lib/SidebarContainer.svelte'
	import type { LayoutProps } from './$types'

	let { data, children }: LayoutProps = $props()

	let nav_data = $derived(data.nav_data)
	let current = $derived(nav_data.current)
</script>

<svelte:head>
	<title>{current.id_primary} {current.id_secondary}:{current.id_tertiary} - TaBiThA Sources</title>
</svelte:head>

<SidebarContainer>
	<div class="sticky top-0 z-10 bg-base-100">
		<Header>
			<div class="flex flex-wrap justify-between ml-5">
				<Navigation nav_data={data.nav_data} />
				<Settings />
			</div>
		</Header>
	</div>

	<main class="mx-8 mt-4 flex-1">
		{#if children}
			{@render children()}
		{/if}
	</main>
	
	<Footer />
</SidebarContainer>