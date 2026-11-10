<script lang="ts">
	import { SidebarSlot, set_sidebar_slot } from '#lib/sidebar_context.svelte.js'
	import type { Snippet } from 'svelte'

	let { children }: { children: Snippet } = $props()

	const sidebar = new SidebarSlot()
	set_sidebar_slot(sidebar)
</script>

<div>
	<div style="margin-right: {sidebar.is_open ? 'calc(24rem - 1rem)' : '0'};" class="flex min-h-screen flex-col transition-all duration-200">
		{@render children()}
	</div>

	{@render sidebar.content?.()}
</div>