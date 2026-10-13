<script lang="ts">
	import type { Snippet } from 'svelte'
	import Icon from '@iconify/svelte'
	import type { OntologyChange } from '#lib/types.js'

	type Props = {
		change: OntologyChange
		children?: Snippet
	}

	let { change, children }: Props = $props()
</script>

{#if change.is_unsynced}
	<div class="border border-warning bg-warning/5 text-warning text-sm p-1 rounded-md flex flex-row items-center gap-1">
		<span class="tooltip" data-tip="Unsynced -- saved on this device, not yet sent to the server">
			<Icon icon="mdi:cloud-off-outline" class="h-4 w-4" />
		</span>
		{@render children?.()}
	</div>
{:else}
	<div class="border border-info bg-info/5 text-info text-sm p-1 rounded-md flex flex-row items-center gap-1">
		<span class="tooltip" data-tip="Pending change...">
			<Icon icon="mdi:clock-outline" class="h-4 w-4" />
		</span>
		{@render children?.()}
	</div>
{/if}
