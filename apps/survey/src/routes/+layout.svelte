<script lang="ts">
	import '#lib/app.css'
	import type { Snippet } from 'svelte'
	import { Header, Footer } from '@tabitha/ui'

	let { children }: { children: Snippet } = $props()
</script>

<Header app="Survey" />

<main class="mx-4 mt-6 sm:mx-8">
	{@render children()}
</main>

<Footer />
