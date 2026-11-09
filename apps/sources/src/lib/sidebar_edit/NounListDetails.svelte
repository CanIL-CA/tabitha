<script lang="ts">
	import { get_edit_history } from '#lib/edit/history.svelte.js'
	import { get_selected_entity } from '#lib/data/selected_entity.svelte.js'
	import { apply_noun_list_index, do_noun_list_indexes_differ, do_concepts_differ } from '#lib/edit/bulk_edit.js'
	import { calculate_noun_list_index } from '#lib/encoding/semantic_encoding.js'
	import type { PageSourceEntity } from '#lib/types.js'

	let { data }: { data: PageSourceEntity } = $props()

	const edit_history = get_edit_history()
	const selected_entity = get_selected_entity()

	let noun_list = $derived(edit_history().noun_list_rows)

	let next_index = $derived(calculate_noun_list_index(noun_list.length))

	let are_concepts_different = $derived(do_concepts_differ({
		concepts: selected_entity.all.flatMap(({ concept }) => concept ?? []),
	}))
	let is_mixed = $derived(do_noun_list_indexes_differ({ entities: selected_entity.all }))

	function set_index(index: string) {
		const details = `${data.concept!.stem}-${data.concept!.sense} -> ${index}`
		edit_history().record({ action: 'noun_index', details, ids_before: selected_entity.ids })
		apply_noun_list_index({ entities: selected_entity.all, index })
	}

	function select_entities_with_index(entity_ids: number[]) {
		selected_entity.select_ids({ ids: entity_ids })
	}

	function add_and_set_index() {
		if (next_index) {
			set_index(next_index)
		}
	}
</script>

{#if are_concepts_different}
	<p class="text-xs text-base-content/60 mb-2">
		The selected concepts are different, so a noun list index can't be set for them together.
	</p>
{/if}

<div
	title={is_mixed ? 'The other selected entities have different noun list indexes' : undefined}
	class="rounded-sm {is_mixed ? 'outline-2 outline-offset-2 outline-warning' : ''}"
>
	<table class="table table-sm table-zebra">
		<tbody>
			{#each noun_list as noun_list_entry}
				{@const is_selected = data.noun_list_index === noun_list_entry.index}
				{@const has_multiple_nouns = noun_list_entry.noun.split(',').length > 1}
				{@const has_no_entities = !noun_list_entry.entity_ids.length}

				<tr class="{has_multiple_nouns || has_no_entities ? 'outline-2 outline-warning' : ''}">
					<td class="{is_selected ? 'font-bold' : ''}">{noun_list_entry.index}</td>
					<td class="{is_selected ? 'font-bold' : ''}">{noun_list_entry.noun}</td>
					<td class="flex gap-1">
						<button
							type="button"
							disabled={has_no_entities}
							title={has_no_entities
								? 'No nouns currently have this index'
								: `Select all ${noun_list_entry.entity_ids.length} with this index`}
							onclick={() => select_entities_with_index(noun_list_entry.entity_ids)}
							class="btn btn-xs btn-soft"
						>
							{noun_list_entry.entity_ids.length}
						</button>
						{#if !is_selected}
							<button
								type="button"
								disabled={are_concepts_different}
								onclick={() => set_index(noun_list_entry.index)}
								class="btn btn-xs"
							>
								Set
							</button>
						{/if}
					</td>
				</tr>
			{/each}
			<tr>
				{#if next_index}
					<td>{next_index}</td>
					<td></td>
					<td>
						<button
							type="button"
							disabled={are_concepts_different}
							onclick={add_and_set_index}
							class="btn btn-xs"
						>
							Set
						</button>
					</td>
				{:else}
					<td colspan="3">Maximum noun-list index reached.</td>
				{/if}
			</tr>
		</tbody>
	</table>
</div>
