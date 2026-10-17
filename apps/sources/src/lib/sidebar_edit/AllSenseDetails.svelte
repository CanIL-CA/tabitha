<script lang="ts">
	import type { OntologyResult, ConceptKey } from '@tabitha/types'
	import AllSenseDetails from '#lib/sidebar/AllSenseDetails.svelte'
	import { get_edit_history } from '#lib/edit/history.svelte.js'

	const { data = $bindable(), title }: { data: ConceptKey, title: string } = $props()

	const edit_history = get_edit_history()

	function set_sense(sense_data: OntologyResult) {
		edit_history().record()
		data.sense = sense_data.sense
	}
</script>

<AllSenseDetails {data} {title}>
	{#snippet actions(sense_data)}
		{#if data.sense !== sense_data.sense}
			<div class="invisible group-hover:visible transition-opacity opacity-0 group-hover:opacity-100">
				<button onclick={() => set_sense(sense_data)} class="btn btn-xs">
					Set
				</button>
			</div>
		{/if}
	{/snippet}
</AllSenseDetails>
