<script lang="ts">
	import ConceptDetails from '#lib/sidebar/ConceptDetails.svelte'
	import ConceptDialog from '#lib/ConceptDialog.svelte'
	import Icon from '@iconify/svelte'
	import { get_edit_history } from '#lib/edit/history.svelte.js'
	import { apply_concept, do_concepts_differ } from '#lib/edit/bulk_edit.js'
	import { get_selected_entity } from '#lib/data/selected_entity.svelte.js'
	import type { ConceptKey } from '@tabitha/types'
	import type { PageSourceEntity } from '#lib/types.js'

	let { data }: { data: PageSourceEntity } = $props()

	let concept = $derived(data.concept!)

	const edit_history = get_edit_history()
	const selected_entity = get_selected_entity()

	let is_mixed = $derived(do_concepts_differ({
		concepts: selected_entity.all.flatMap(({ concept }) => concept ?? []),
	}))

	function set_concept(concept: ConceptKey) {
		edit_history().record()
		apply_concept({ entities: selected_entity.all, concept })
	}

	let dialog_open = $state(false)
	function open_dialog() {
		dialog_open = true
	}
	function close_dialog() {
		dialog_open = false
	}
</script>

<div
	title={is_mixed ? 'The other selected entities have different concepts' : undefined}
	class="rounded-sm {is_mixed ? 'outline-2 outline-offset-2 outline-warning' : ''}"
>
	<ConceptDetails data={concept}>
		{#snippet actions()}
			<button onclick={open_dialog} class="btn btn-xs">
				Change <Icon icon="mdi:edit-outline" class="h-4 w-4" />
			</button>
		{/snippet}
	</ConceptDetails>
</div>

{#if dialog_open}
	<ConceptDialog bind:concept={() => concept, set_concept} onclose={close_dialog} />
{/if}
