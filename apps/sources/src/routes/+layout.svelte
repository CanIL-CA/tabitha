<script lang="ts">
	import '#lib/app.css'
	import { onMount, type Snippet } from 'svelte'
	import { onNavigate } from '$app/navigation'
	import { theme_state } from '@tabitha/ui'
	import { report_active_theme } from '@tabitha/usage/client'

	let { children }: { children?: Snippet } = $props()

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

{#if children}
	{@render children()}
{/if}
