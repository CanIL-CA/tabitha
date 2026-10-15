<script lang="ts">
	import type { PageSourceConcept } from '#lib/types.js'
	import { get_ontology_senses } from '#lib/data/ontology_senses_context.svelte.js'
	import HoverPopup from './HoverPopup.svelte'

	let { data }: { data: PageSourceConcept } = $props()

	const ontology_senses = get_ontology_senses()

	let ontology_data = $derived(ontology_senses.sense_of(data))
</script>

<HoverPopup>
	{#snippet button_content()}
		{#if data.sense === 'A'}
			{data.stem}
		{:else}
			{data.stem}-{data.sense}
		{/if}
	{/snippet}
	{#snippet dropdown_content()}
		{@const { level, gloss } = ontology_data}
		<div class="text-base-content">
			<p>
				<span class="badge badge-outline L{level} badge-sm font-mono me-1">L{level}</span>
				<span>{gloss}</span>
			</p>
		</div>
	{/snippet}
</HoverPopup>
