<script lang="ts">
	import type { PageSourceConcept } from '#lib/types.js'
	import ConceptDetails from '#lib/sidebar/ConceptDetails.svelte'
	import ConceptDialog from '#lib/ConceptDialog.svelte'
	import Icon from '@iconify/svelte'
	import { get_edit_history } from '#lib/edit/history.svelte.js'

	let { data = $bindable() }: { data: PageSourceConcept } = $props()

	const edit_history = get_edit_history()

	function set_concept(concept: PageSourceConcept) {
		edit_history().record()
		data = concept
	}

	let dialog_open = $state(false)
	function open_dialog() {
		dialog_open = true
	}
	function close_dialog() {
		dialog_open = false
	}
</script>

<ConceptDetails bind:data>
	{#snippet actions()}
		<button onclick={open_dialog} class="btn btn-xs">
			Change <Icon icon="mdi:edit-outline" class="h-4 w-4" />
		</button>
	{/snippet}
</ConceptDetails>

{#if dialog_open}
	<ConceptDialog bind:concept={() => data, set_concept} onclose={close_dialog} />
{/if}
