<script lang="ts">
	import { status_list } from '#lib/data/lookups.js'
	import EncodingStatus from '#lib/EncodingStatus.svelte'
	import Icon from '@iconify/svelte'

	let { data } = $props()

	let status_groups = $derived(data.status_groups)
	let selected_status = $state('All')

	let filtered_status_groups = $derived(status_groups.map(({ group_name, statuses }) => ({
		group_name,
		statuses: selected_status === 'All' ? statuses : statuses.filter(s => s.status === selected_status),
	})))
</script>

<div class="prose">
	<h2>Encoding Status</h2>
</div>

<div class="my-3">
	Status
	<select bind:value={selected_status} class="select">
		<option value="All" selected>All</option>
		{#each status_list.toReversed() as status}
			<option value={status}>{status}</option>
		{/each}
	</select>
</div>

<div class="flex flex-col md:flex-row py-3 gap-7">
	{#each filtered_status_groups as { group_name, statuses }}
		<div class="w-full md:flex-auto">
			<table class="table table-zebra">
				<thead><tr><th>{group_name}</th></tr></thead>
				<tbody>
					{#each statuses as { reference: { type, id_primary }, status }}
						<tr>
							<th>{id_primary}</th>
							<td>
								<EncodingStatus {status} />
							</td>
							<td>
								<a href="/lookup/status/{type}/{id_primary}" class="link flex">
									Chapter details
									<Icon icon="fe:link-external" class="h-4 w-4 mt-1" />
								</a>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/each}
</div>
