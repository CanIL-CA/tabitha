<script lang="ts">
	let { data } = $props()

	let features_by_category = $derived(data.features)

	let chosen_category = $state('Noun')
	let features_to_show = $derived(features_by_category.get(chosen_category) || [])

</script>

<div class="prose">
	<h2>Features</h2>
</div>

<div class="my-3">
	Category
	<select bind:value={chosen_category} class="select">
		{#each features_by_category.keys() as category}
			<option value={category}>{category}</option>
		{/each}
	</select>
</div>

{#if features_to_show.length === 0}
	<div>No source features yet.</div>
{/if}

{#each features_to_show as { name, values }}
	<div class="collapse collapse-arrow bg-base-100 border-base-300 border">
		<input type="checkbox" />
		<div class="collapse-title font-semibold after:start-5 after:end-auto py-2 pe-4 ps-12">
			{name}
		</div>
		<div class="collapse-content">
			<table class="table table-sm table-zebra table-fixed">
				<tbody>
					{#each values as { value, code, example }}
						<tr>
							<td>{value}</td>
							<td>{code}</td>
							<td>{@html example?.replaceAll(/<BLD>(.*?)<>/g, '<span class="font-bold">$1</span>') || ''}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
{/each}
