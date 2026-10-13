<script lang="ts">
	import type { EntityFeature, SourceEntity } from '@tabitha/types'
	import { is_used_in_source } from '#lib/encoding/features.js'

	let { source_entity, classes = '' }: { source_entity: SourceEntity, classes?: string } = $props()

	let category = $derived(source_entity.category)
	let features = $derived(source_entity.features)

	let features_to_display = $derived.by(() => {
		const list = features.filter(is_used_in_source(category))
		if (source_entity.noun_list_index) {
			return [{ name: 'Noun List Index', value: source_entity.noun_list_index }, ...list]
		}
		return list
	})

	function can_be_dulled({ value }: EntityFeature) {
		return value === 'No' || ['Un', 'No ', 'Not '].some(prefix => value.startsWith(prefix))
	}
</script>

{#if features.length}
	<ul class="{classes}">
		<li class='font-semibold'>{category}</li>
		{#each features_to_display as feature}
			<li class='{can_be_dulled(feature) ? 'opacity-50' : ''}'>
				<span class='font-semibold'>{feature.name}</span> = {feature.value}
			</li>
		{/each}
	</ul>
{/if}
