<script lang="ts">
	import { onMount } from 'svelte'
	import { Search } from '#lib/index.js'
	import { get_header_content } from '#lib/header_content.svelte.js'

	const header_content = get_header_content()
	onMount(() => {
		header_content.current = header_content_snippet
		return () => (header_content.current = null)
	})

</script>

{#snippet header_content_snippet()}
	<div class="flex-1 min-w-64">
		<Search />
	</div>
{/snippet}