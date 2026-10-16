<script lang="ts">
	import Icon from '@iconify/svelte'
	import type { Snippet } from 'svelte'

	type Props = {
		heading: string
		children: Snippet
		onclose: () => void
	}
	let { heading, children, onclose }: Props = $props()
</script>

<svelte:window onkeydown={e => e.key === 'Escape' && onclose()} />

<div class="fixed top-0 right-0 h-full w-96 bg-base-100 border-l border-base-300 shadow-xl flex flex-col">
	<button onclick={onclose} class="btn btn-circle btn-ghost btn-sm absolute right-3 top-5">
		<Icon icon="material-symbols:close" class="h-4 w-4" />
	</button>

	<div class="p-4 flex-1 overflow-auto">
		<h3 class="text-2xl font-bold">{heading}</h3>

		{@render children()}
	</div>
</div>