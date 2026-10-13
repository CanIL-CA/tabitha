<script lang="ts">
	import '#lib/app.css'
	import type { Snippet } from 'svelte'
	import { page } from '$app/state'

	let { children }: { children?: Snippet } = $props()

	const canonicalUrl = $derived(new URL(page.url.pathname, 'https://tabitha.bible').href)
</script>

<svelte:head>
	<link rel="canonical" href={canonicalUrl} />
	<meta property="og:url" content={canonicalUrl} />
</svelte:head>

<div class="site">
	<header class="site-header">
		<a href="/" class="wordmark">TaBiThA</a>
	</header>

	<main class="site-main">
		{#if children}
			{@render children()}
		{/if}
	</main>

	<footer class="site-footer">
		<a href="https://github.com/CanIL-CA/tabitha" class="footer-link">GitHub</a>
		<a href="/privacy" class="footer-link">Privacy</a>
	</footer>
</div>
