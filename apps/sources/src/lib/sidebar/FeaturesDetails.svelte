<script lang="ts">
	import type { EntityFeature } from '@tabitha/types'
	import type { PageSourceEntity } from '#lib/types.js'
	import { is_used_in_source } from '#lib/encoding/features.js'

	const { data }: { data: PageSourceEntity } = $props()

	let filtered_features = $derived(data.features.filter(is_used_in_source(data.category)))

	function can_be_dulled({ value }: EntityFeature): boolean {
		return value === 'No' || ['Un', 'No ', 'Not '].some(prefix => value.startsWith(prefix))
	}
</script>

{#if filtered_features.length === 0}
	<p>No features to show.</p>
{:else}
	<table class="table table-sm table-zebra">
		<tbody>
			{#each filtered_features as feature}
				<tr class='{can_be_dulled(feature) ? 'opacity-50' : ''}'>
					<td>{feature.name}</td>
					<td>{feature.value}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}
