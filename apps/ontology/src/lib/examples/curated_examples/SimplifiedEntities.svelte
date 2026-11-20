<script lang="ts">
	import { get_coded_feature_label, is_boundary_end, is_boundary_start } from '#lib/curated_example/format.js'
	import type { CuratedExampleEncoding, CuratedExampleEntity } from '#lib/types.js'

	type Props = {
		entities: CuratedExampleEncoding
	}

	let { entities }: Props = $props()

	/**
	 * Find the parent boundary, or if the entity is a boundary, return itself
	 */
	function find_closest_boundary(index: number): CuratedExampleEntity {
		let inner_level = 0
		for (let j = index; j >= 0; j--) {
			const entity = entities[j]
			if (is_boundary_start(entity)) {
				if (inner_level === 0) {
					return entity
				} else {
					inner_level -= 1
				}
			} else if (is_boundary_end(entity) && j !== index) {
				// skip over any phrases/clauses nested within this one
				inner_level += 1
			}
		}
		console.error('Unexpected entity structure with index:', index)
		return entities[index]
	}

	function get_style_class(index: number): string {
		return `entity-${find_closest_boundary(index).category_abbr}`
	}
</script>

{#each entities as entity, i (i)}
	{@const is_boundary = is_boundary_start(entity) || is_boundary_end(entity)}
	{@const label = is_boundary ? entity.category_abbr : entity.value}
	{@const style_class = get_style_class(i)}
	{@const coded_feature_label = get_coded_feature_label(entity)}

	<span class="mb-1 py-2 not-italic text-base-content flex items-center">
		{#if is_boundary}
			<span class="text-3xl font-thin {style_class}">
				{entity.value}
			</span>
		{/if}

		{#if coded_feature_label}
			<span class="text-md pt-2 font-medium {style_class}">
				{label}-{coded_feature_label}
			</span>
		{:else}
			<span class="text-md pt-2 font-normal {style_class}">
				{label}
			</span>
		{/if}
	</span>
{/each}

<style>
	.entity-Prop {
		opacity: 0.6;
	}
</style>
