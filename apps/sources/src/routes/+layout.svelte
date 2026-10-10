<script lang="ts">
	import '#lib/app.css'
	import { onMount, type Snippet } from 'svelte'
	import { onNavigate } from '$app/navigation'
	import { Search } from '#lib/index.js'
	import { Header, Footer, theme_state } from '@tabitha/ui'
	import { report_active_theme } from '@tabitha/usage/client'
	import { registerSW } from 'virtual:pwa-register'

	let { children }: { children?: Snippet } = $props()

	// No-op instead of the default forced reload: the page picks up a new version on its next navigation.
	registerSW({ immediate: true, onNeedReload: () => {} })

	onMount(() => report_active_theme(theme_state.current))

	onNavigate(navigation => {
		// Skip view transitions for non-supporting browsers, full page unloads (like native GET forms), or non-route navigations
		if (!document.startViewTransition || navigation.willUnload || !navigation.to?.route.id) return

		return new Promise(resolve => {
			document.startViewTransition(async () => {
				resolve()
				await navigation.complete
			})
		})
	})
</script>

<!-- layout not handled by daisyUI, https://daisyui.com/docs/layout-and-typography -->

<Header app="Sources">
	<Search />
</Header>

<main class="mx-8 mt-8">
	{#if children}
		{@render children()}
	{/if}
</main>

<Footer>
	<a href="/lookup/status/Bible" class="link link-hover">Bible encoding status</a>
	<a href="/lookup/features" class="link link-hover">Source features list</a>
</Footer>
