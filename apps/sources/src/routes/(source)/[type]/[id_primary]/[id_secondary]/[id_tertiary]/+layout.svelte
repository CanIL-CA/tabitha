<script lang="ts">
	import { Header, Footer, Settings } from '#lib/index.js'
	import Navigation from '#lib/Navigation.svelte'
	import { SidebarSlot, set_sidebar_slot } from '#lib/sidebar_context.svelte.js'
	import { page } from '$app/state'
	import type { LayoutProps } from './$types'

	let { data, children }: LayoutProps = $props()

	const sidebar = new SidebarSlot()
	set_sidebar_slot(sidebar)

	let nav_data = $derived(data.nav_data)
	let current = $derived(nav_data.current)

	let is_edit = $derived(page.url.pathname.toLowerCase().endsWith('/edit'))
	let url_end = $derived(is_edit ? '/edit' : undefined)
</script>

<svelte:head>
	<title>{is_edit ? 'Edit ' : ''}{current.id_primary} {current.id_secondary}:{current.id_tertiary} - TaBiThA Sources</title>
</svelte:head>


<div>
	<div style="margin-right: {sidebar.is_open ? 'calc(24rem - 1rem)' : '0'};" class="flex min-h-screen flex-col transition-all duration-200">
		<Header>
			<div class="flex flex-wrap justify-between">
				<Navigation nav_data={data.nav_data} {url_end} />
				<Settings />
			</div>
		</Header>

		<main class="mx-8 mt-4 flex-1">
			{#if children}
				{@render children()}
			{/if}
		</main>
		
		<Footer />
	</div>

	{@render sidebar.content?.()}
</div>