<script lang="ts">
	import Icon from '@iconify/svelte'
	import { SidebarSlot, set_sidebar_slot } from '#lib/sidebar_context.svelte.js'
	import { fly } from 'svelte/transition'
	import type { Snippet } from 'svelte'

	let { children }: { children: Snippet } = $props()

	const sidebar = new SidebarSlot()
	set_sidebar_slot(sidebar)
</script>

<svelte:window onkeydown={e => e.key === 'Escape' && sidebar.onclose()} />

<div>
	<div style="margin-right: {sidebar.is_open ? 'calc(24rem - 1rem)' : '0'};" class="flex min-h-screen flex-col transition-all duration-200">
		{@render children()}
	</div>

	{#if sidebar.content}
		<div
			transition:fly|global={{ x: '100%', opacity: 1, duration: 200 }}
			class="fixed top-0 right-0 h-full w-96 bg-base-100 border-l border-base-300 shadow-xl flex flex-col z-20"
		>
			<button onclick={sidebar.onclose} class="btn btn-circle btn-ghost btn-sm absolute right-3 top-5">
				<Icon icon="material-symbols:close" class="h-4 w-4" />
			</button>

			<div class="p-4 flex-1 overflow-auto">
				<h3 class="text-2xl font-bold">{sidebar.heading}</h3>

				{@render sidebar.content()}
			</div>
		</div>
	{/if}
</div>