<script lang="ts">
	import type { OntologyResult } from '@tabitha/types'
	import AllSenseDetails from '#lib/sidebar/AllSenseDetails.svelte'
	import { get_edit_history } from '#lib/edit/history.svelte.js'
	import { get_selected_entity } from '#lib/data/selected_entity.svelte.js'
	import { apply_sense, do_stems_differ } from '#lib/edit/bulk_edit.js'
	import type { PageSourceEntity } from '#lib/types.js'

	type Props = {
		data: PageSourceEntity
		title: string
		field: 'concept' | 'pairing_concept'
	}
	const { data, title, field }: Props = $props()

	const edit_history = get_edit_history()
	const selected_entity = get_selected_entity()

	let displayed_concept = $derived(data[field]!)
	let concepts = $derived(selected_entity.all.flatMap(entity => entity[field] ?? []))
	let can_set_sense = $derived(!do_stems_differ({ concepts }))

	function set_sense(sense_data: OntologyResult) {
		edit_history().record()
		apply_sense({ concepts, sense: sense_data.sense })
	}
</script>

<AllSenseDetails
	data={displayed_concept}
	{title}
	notice={can_set_sense ? undefined : "The selected concepts have different stems, so their sense can't be changed together."}
>
	{#snippet actions(sense_data)}
		{#if can_set_sense && concepts.some(({ sense }) => sense !== sense_data.sense)}
			<div class="invisible group-hover:visible transition-opacity opacity-0 group-hover:opacity-100">
				<button onclick={() => set_sense(sense_data)} class="btn btn-xs">
					Set
				</button>
			</div>
		{/if}
	{/snippet}
</AllSenseDetails>
