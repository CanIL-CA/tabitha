<script>
	import '#lib/app.css'
	import { Search } from '#lib/index.js'
	import { onMount } from 'svelte'
	import { Header, Footer, theme_state } from '@tabitha/ui'
	import { report_active_theme } from '@tabitha/usage/client'

	let { data, children } = $props()
	let project = $derived(data.project)

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
