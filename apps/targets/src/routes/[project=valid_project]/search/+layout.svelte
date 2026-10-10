<script>
	import '#lib/app.css'
	import { Search } from '#lib/index.js'
	import { onMount } from 'svelte'
	import { Header, Footer, theme_state } from '@tabitha/ui'
	import { report_active_theme } from '@tabitha/usage/client'
	import { registerSW } from 'virtual:pwa-register'

	let { data, children } = $props()
	let project = $derived(data.project)

	// No-op instead of the default forced reload: the page picks up a new version on its next navigation.
	registerSW({ immediate: true, onNeedReload: () => {} })

	onMount(() => report_active_theme(theme_state.current))
</script>

<!-- layout not handled by daisyUI, https://daisyui.com/docs/layout-and-typography -->

<Header app="Targets">
	<Search {project} />
</Header>

<main class="mx-8 mt-6">
	{@render children?.()}
</main>

<Footer />
