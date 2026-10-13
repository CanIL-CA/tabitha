<script lang="ts">
	import '#lib/app.css'

	import { Header, Footer, theme_state } from '@tabitha/ui'
	import { report_active_theme } from '@tabitha/usage/client'
	import AppNav from '#lib/AppNav.svelte'
	import { onMount, type Snippet } from 'svelte'
	import { registerSW } from 'virtual:pwa-register'

	type Props = {
		children: Snippet
	}

	let { children }: Props = $props()

	// No-op instead of the default forced reload: the page picks up a new version on its next navigation.
	registerSW({ immediate: true, onNeedReload: () => {} })

	onMount(() => report_active_theme(theme_state.current))
</script>

<!-- layout not handled by daisyUI, https://daisyui.com/docs/layout-and-typography -->
<Header app="Editor">
	<AppNav />
</Header>

<main class="mx-8 mt-8">
	{@render children()}
</main>

<Footer />
