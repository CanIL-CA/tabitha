<script lang="ts">
	import type { OntologyResult } from '@tabitha/types'
	import type { PageSourceConcept } from '#lib/types.js'
	import { fetch_all_concepts_for_part_of_speech } from '#lib/data/api_lookups.js'
	import Icon from '@iconify/svelte'
	import { onMount } from 'svelte'

	type Props = {
		concept: PageSourceConcept
		onclose: () => void
		filter?: (result: OntologyResult) => boolean
	}
	let { concept = $bindable(), onclose, filter }: Props = $props()

	let dialog: HTMLDialogElement
	let concept_list = $state<OntologyResult[]>([])

	onMount(() => {
		dialog.showModal()
		
		fetch_all_concepts_for_part_of_speech(concept.part_of_speech).then(fetched_concepts => {
			concept_list = filter ? fetched_concepts.filter(filter) : fetched_concepts

			selected_index = concept_list.findIndex(({ stem, sense }) => concept.stem === stem && concept.sense === sense)
		})
	})

	let selected_index = $state(-1)
	let is_selected = $derived(selected_index > -1)

	function set_concept() {
		const selected_concept = concept_list[selected_index]
		const { stem, sense, part_of_speech } = selected_concept
		concept = {
			stem,
			sense,
			part_of_speech,
			ontology_data: selected_concept,
		}

		dialog.close()
	}

</script>

<!-- https://daisyui.com/components/modal -->
<dialog bind:this={dialog} {onclose} class="modal">
	<section class="modal-box max-w-none w-3/4">
		<form method="dialog">
			<button class="btn btn-circle btn-ghost btn-sm absolute right-2 top-2">
				<Icon icon="material-symbols:close" class="h-4 w-4" />
			</button>
		</form>

		<article class="card">
			<main class="card-body">
				<h2 class="card-title">Select a {concept.part_of_speech}</h2>

				<section class="prose max-w-none">
					<select bind:value={selected_index} class="select w-full">
						{#each concept_list as { stem, sense, gloss }, i}
							<option value={i}>
								{stem}-{sense} - {gloss}
							</option>
						{/each}
					</select>
				</section>

				<section class="card-actions mt-4 justify-end">
					<button onclick={set_concept} disabled={!is_selected} class="btn btn-primary btn-md">
						SELECT
					</button>
					<form method="dialog">
						<button class="btn btn-secondary btn-md">
							CANCEL
						</button>
					</form>
				</section>
			</main>
		</article>
	</section>

	<form method="dialog" class="modal-backdrop">
		<button>Close</button>
	</form>
</dialog>