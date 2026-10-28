<script lang="ts">
	import Icon from '@iconify/svelte'
	import PendingChange from '#lib/changes/PendingChange.svelte'
	import type { Concept } from '#lib/types.js'

	let { concept, compact = false }: { concept: Concept, compact?: boolean } = $props()

	let pending_change = $derived(concept.pending_changes.find(change => change.data.gloss))
</script>

{#if concept.status === 'not used'}
	{#if compact}
		<span class="badge badge-error badge-soft gap-1 font-semibold">
			<Icon icon="mdi:error-outline" class="h-4 w-4" />
			{concept.gloss}
		</span>
	{:else}
		<div role="alert" class="alert alert-error alert-soft">
			<Icon icon="mdi:error-outline" class="h-6 w-6" />
			<span class="font-bold">{concept.gloss}</span>
		</div>
	{/if}
{:else if concept.status === 'suggested'}
	{#if compact}
		<span class="badge badge-warning badge-soft gap-1 font-semibold">
			<Icon icon="mdi:alert-outline" class="h-4 w-4" />
			{concept.gloss}
		</span>
	{:else}
		<div role="alert" class="alert alert-warning alert-soft">
			<Icon icon="mdi:alert-outline" class="h-6 w-6" />
			<span class="font-bold">{concept.gloss}</span>
		</div>
	{/if}
{:else}
	{concept.gloss}
	{#if pending_change}
		<br />
		<PendingChange change={pending_change}>
			{pending_change.data.gloss!.value}
		</PendingChange>
	{/if}
{/if}
