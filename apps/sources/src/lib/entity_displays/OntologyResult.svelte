<script lang="ts">
	import type { OntologyResult } from '@tabitha/types'
	import type { PageSourceConcept } from '#lib/types.js'
	import { fetch_concept_ontology_data } from '#lib/data/api_lookups.js'
	import HoverPopup from './HoverPopup.svelte'

	let { data }: { data: PageSourceConcept } = $props()

	let ontology_data = $state<OntologyResult | null>(null)

	$effect(() => {
		let canceled = false

		if (data.ontology_data) {
			ontology_data = data.ontology_data
			return
		}

		fetch_concept_ontology_data(data).then(res => {
			if (!canceled) {
				ontology_data = res
			}
		})

		return () => {
			canceled = true
		}
	})
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
		<div class="text-base-content">
			{#if ontology_data}
				{@const { level, gloss } = ontology_data}
				<p>
					<span class="badge badge-outline L{level} badge-sm font-mono me-1">L{level}</span>
					<span>{gloss}</span>
				</p>
			{:else}
				<span>Loading Ontology data...</span>
			{/if}
		</div>
	{/snippet}
</HoverPopup>
