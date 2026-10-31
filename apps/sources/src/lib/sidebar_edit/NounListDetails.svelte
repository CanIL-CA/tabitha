<script lang="ts">
	import { get_edit_history } from '#lib/edit/history.svelte.js'
	import { get_selected_entity } from '#lib/data/selected_entity.svelte.js'
	import { apply_noun_list_index, do_noun_list_indexes_differ, do_concepts_differ } from '#lib/edit/bulk_edit.js'
	import type { PageSourceEntity } from '#lib/types.js'

	let { data }: { data: PageSourceEntity } = $props()

	const edit_history = get_edit_history()
	const selected_entity = get_selected_entity()

	let noun_list = $derived(edit_history().current.noun_list)

	let next_index = $derived(calculate_next_index())

	let are_concepts_different = $derived(do_concepts_differ({
		concepts: selected_entity.all.flatMap(({ concept }) => concept ?? []),
	}))
	let is_mixed = $derived(do_noun_list_indexes_differ({ entities: selected_entity.all }))

	function set_index(index: string) {
		edit_history().record()
		apply_noun_list_index({ entities: selected_entity.all, index })
	}

	function calculate_next_index() {
		const next = noun_list.length + 1
		if (next >= 10) {
			// index 10 and up use capital letters starting with A (ascii 65)
			return String.fromCharCode(65 + next - 10)
		} else {
			return next.toString()
		}
	}

	function add_and_set_index() {
		edit_history().record()
		apply_noun_list_index({ entities: selected_entity.all, index: next_index })
		noun_list.push({ index: next_index, noun: `${data.concept?.stem}-${data.concept?.sense}` })
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
				<tr class="group">
					<td class="{is_selected ? 'font-bold' : ''}">{noun_list_entry.index}</td>
					<td class="{is_selected ? 'font-bold' : ''}">{noun_list_entry.noun}</td>
					<td>
						{#if !is_selected}
							<div class="invisible group-hover:visible transition-opacity opacity-0 group-hover:opacity-100">
								<button
									disabled={are_concepts_different}
									onclick={() => set_index(noun_list_entry.index)}
									class="btn btn-xs"
								>
									Set index
								</button>
							</div>
						{/if}
					</td>
				</tr>
			{/each}
			<tr class="group">
				<td>{next_index}</td>
				<td></td>
				<td>
					<div class="invisible group-hover:visible transition-opacity opacity-0 group-hover:opacity-100">
						<button
							disabled={are_concepts_different}
							onclick={add_and_set_index}
							class="btn btn-xs"
						>
							Set index
						</button>
					</div>
				</td>
			</tr>
		</tbody>
	</table>
</div>
