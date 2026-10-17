<script lang="ts">
	import type { NounListEntry } from '@tabitha/types'
	import type { PageSourceEntity } from '#lib/types.js'
	import { page } from '$app/state'

	let { data }: { data: PageSourceEntity } = $props()

	let noun_list = $derived<NounListEntry[]>(page.data.source.noun_list)
</script>

<table class="table table-sm table-zebra">
	<tbody>
		{#each noun_list as noun_list_entry}
			{@const is_selected = data.noun_list_index === noun_list_entry.index}
			<tr class="group">
				<td class="{is_selected ? 'font-bold' : ''}">{noun_list_entry.index}</td>
				<td class="{is_selected ? 'font-bold' : ''}">{noun_list_entry.noun}</td>
			</tr>
		{/each}
	</tbody>
</table>
