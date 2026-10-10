<script lang="ts">
	import type { NounListEntry } from '@tabitha/types'
	import type { PageSourceEntity } from '#lib/types.js'
	let { data, noun_list }: { data: PageSourceEntity, noun_list: NounListEntry[] } = $props()
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
