<script>
	import { page } from '$app/state'
	import '#lib/app.css'

	import { onMount } from 'svelte'
	import { Header, Footer, theme_state, set_ui_messages } from '@tabitha/ui'
	import { report_active_theme } from '@tabitha/usage/client'
	import { m } from '#lib/paraglide/messages.js'

	let { children } = $props()

	set_ui_messages(m)

	onMount(() => report_active_theme(theme_state.current))

	const nav_links = [
		{ name: m.nav_home(), href: '/' },
		{ name: m.nav_batch(), href: '/batch' },
	]
</script>

<Header app="Copilot">
	<nav aria-label={m.nav_label()}>
		<div class="tabs tabs-border">
			{#each nav_links as { name, href }}
				<a
					{href}
					class="tab {page.url.pathname === href ? 'tab-active' : ''}"
					aria-current={page.url.pathname === href ? 'page' : undefined}>{name}</a>
			{/each}
		</div>
	</nav>
</Header>

<div role="alert" class="alert alert-error mx-8">
	<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
		<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
	</svg>
	<span>{m.experimental_notice()}</span>
</div>

<main class="mx-8 mt-8">
	{@render children()}
</main>

<Footer />
