<script lang="ts">
	import { is_used_in_source } from '#lib/encoding/features.js'
	import { page } from '$app/state'
	import { get_edit_history } from '#lib/edit/history.svelte.js'
	import { apply_feature_value, do_feature_values_differ } from '#lib/edit/bulk_edit.js'
	import { get_selected_entity } from '#lib/data/selected_entity.svelte.js'
	import type { EntityFeature } from '@tabitha/types'
	import type { PageSourceEntity, FeatureMap, FeatureInfo, FeatureValueInfo } from '#lib/types.js'

	const { data }: { data: PageSourceEntity } = $props()

	const edit_history = get_edit_history()
	const selected_entity = get_selected_entity()

	function set_feature_value({ feature_name, value }: { feature_name: string, value: string }) {
		edit_history().record()
		apply_feature_value({ entities: selected_entity.all, feature_name, value })
	}

	let filtered_features = $derived(data.features.filter(is_used_in_source(data.category)))
	let category_features = $derived<FeatureInfo[]>((page.data.features as FeatureMap).get(data.category) ?? [])

	$effect(() => {
		if (data.category === 'Noun Phrase') {
			// Update the semantic role feature code.
			// We only care about the semantic role code because it's the only one that is currently displayed.
			// If we end up displaying more, we can use the feature_structure_to_codes() function in encoding/features.ts
			const semantic_role_value = data.features.find((f: EntityFeature) => f.name === 'Semantic Role')?.value
			const semantic_role_code = category_features
				.find((f: FeatureInfo) => f.name === 'Semantic Role')
				?.values.find((v: FeatureValueInfo) => v.value === semantic_role_value)?.code
			if (semantic_role_code) {
				data.feature_codes = data.feature_codes.slice(0, 1) + semantic_role_code + data.feature_codes.slice(2)
			}
		}
	})
</script>

{#if filtered_features.length === 0}
	<p>No features to show.</p>
{:else}
	<table class="table table-sm table-zebra">
		<tbody>
			{#each data.features as feature}
				{#if is_used_in_source(data.category)(feature)}
					{@const possible_values = category_features.find((f: FeatureInfo) => f.name === feature.name)?.values || []}
					{@const is_mixed = do_feature_values_differ({ entities: selected_entity.all, feature_name: feature.name })}
					<tr>
						<td class="w-2/5">{feature.name}</td>
						<td class="w-3/5">
							<select
								bind:value={() => feature.value, value => set_feature_value({ feature_name: feature.name, value })}
								title={is_mixed ? 'The other selected entities have different values' : undefined}
								class="select select-sm {is_mixed ? 'select-warning' : ''}"
							>
								{#each possible_values as value}
									<option value={value.value}>{value.value}</option>
								{/each}
							</select>
						</td>
					</tr>
				{/if}
			{/each}
		</tbody>
	</table>
{/if}
