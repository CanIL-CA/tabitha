<script lang="ts">
	import { get_edit_history } from '#lib/edit/history.svelte.js'
	import { get_selected_entity } from '#lib/data/selected_entity.svelte.js'
	import { apply_noun_list_index, do_noun_list_indexes_differ, do_concepts_differ } from '#lib/edit/bulk_edit.js'
	import type { PageSourceEntity } from '#lib/types.js'
	import type { NounListEntry } from '@tabitha/types'

	type NounListRow = NounListEntry & { entity_ids: number[] }

	let { data }: { data: PageSourceEntity } = $props()

	const edit_history = get_edit_history()
	const selected_entity = get_selected_entity()

	let noun_list = $derived(edit_history().current.noun_list)
	let full_noun_list: NounListRow[] = $derived.by(() => {
		const { source_entities, noun_list } = edit_history().current
		const full_noun_list = $state.snapshot(noun_list).map<NounListRow>(entry => ({ ...entry, entity_ids: [] }))

		for (const { id, concept, pairing_concept, noun_list_index } of source_entities) {
			if (!noun_list_index || !concept) {
				continue
			}
			const list_entry = full_noun_list.find(({ index }) => index === noun_list_index)
			const pairing_key = pairing_concept ? `/${pairing_concept.stem}-${pairing_concept.sense}` : ''
			const key = `${concept.stem}-${concept.sense}${pairing_key}`
			if (!list_entry) {
				full_noun_list.push({ index: noun_list_index, noun: key, entity_ids: [id] })
				continue
			}
			list_entry.entity_ids.push(id)
			if (!list_entry.noun.split(', ').includes(key)) {
				list_entry.noun = `${list_entry.noun}, ${key}`
			}
		}
		return full_noun_list
	})

	let next_index = $derived(calculate_next_index())

	let are_concepts_different = $derived(do_concepts_differ({
		concepts: selected_entity.all.flatMap(({ concept }) => concept ?? []),
	}))
	let is_mixed = $derived(do_noun_list_indexes_differ({ entities: selected_entity.all }))

	function set_index(index: string) {
		edit_history().record({ ids_before: selected_entity.ids })
		apply_noun_list_index({ entities: selected_entity.all, index })
	}

	function select_entities_with_index(entity_ids: number[]) {
		selected_entity.select_ids({ ids: entity_ids })
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
		edit_history().record({ ids_before: selected_entity.ids })
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
			{#each full_noun_list as noun_list_entry}
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
								Set index
							</button>
						{/if}
					</td>
				</tr>
			{/each}
			<tr>
				<td>{next_index}</td>
				<td></td>
				<td>
					<button
						type="button"
						disabled={are_concepts_different}
						onclick={add_and_set_index}
						class="btn btn-xs"
					>
						Set index
					</button>
				</td>
			</tr>
		</tbody>
	</table>
</div>
