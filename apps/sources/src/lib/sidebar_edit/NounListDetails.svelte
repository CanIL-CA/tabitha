<script lang="ts">
	import type { NounList } from '@tabitha/types'
	import type { PageSourceEntity } from '#lib/types.js'

	let { data = $bindable(), noun_list = $bindable() }: { data: PageSourceEntity, noun_list: NounList } = $props()

	const next_index = $derived(calculate_next_index())

	function set_index(index: string) {
		data.noun_list_index = index
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
		set_index(next_index)
		noun_list.push({ index: next_index, noun: `${data.concept?.stem}-${data.concept?.sense}` })
	}
</script>

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
							<button onclick={() => set_index(noun_list_entry.index)} class="btn btn-xs">
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
					<button onclick={add_and_set_index} class="btn btn-xs">
						Set index
					</button>
				</div>
			</td>
		</tr>
	</tbody>
</table>
