<script lang="ts">
	import { get_coded_feature_label, is_boundary_end, is_boundary_start } from '#lib/curated_example/format.js'
	import type { CuratedExampleEntityStructured } from '#lib/types.js'

	type Props = {
		entities: CuratedExampleEntityStructured[]
		/** Makes the entities buttons, except those that `is_clickable` says are not */
		onclick?: (index: number) => void
		is_clickable?: (index: number) => boolean
		onhover?: (index: number | null) => void
		/** The entities to show as the ones that a click would act on */
		highlighted_indexes?: Set<number>
	}

	let { entities, onclick, is_clickable = () => true, onhover, highlighted_indexes }: Props = $props()

	/**
	 * Find the parent boundary, or if the entity is a boundary, return itself
	 */
	function get_boundary_category(index: number): string {
		const entity = entities[index]
		if (is_boundary_start(entity)) return entity.category_abbr

		return entity.parent >= 0 ? entities[entity.parent].category_abbr : entity.category_abbr
	}

	function get_style_class(index: number): string {
		return `entity-${get_boundary_category(index)}`
	}
</script>

{#each entities as entity, i (i)}
	{@const is_boundary = is_boundary_start(entity) || is_boundary_end(entity)}
	{@const label = is_boundary ? entity.category_abbr : entity.value}
	{@const style_class = get_style_class(i)}
	{@const coded_feature_label = get_coded_feature_label(entity)}
	{@const is_button = onclick !== undefined && is_clickable(i)}

	<svelte:element
		this={is_button ? 'button' : 'span'}
		type={is_button ? 'button' : undefined}
		role={is_button ? undefined : 'presentation'}
		onclick={is_button ? () => onclick?.(i) : undefined}
		onmouseenter={() => onhover?.(i)}
		onmouseleave={() => onhover?.(null)}
		onfocus={() => onhover?.(i)}
		onblur={() => onhover?.(null)}
		class="mb-1 px-1 py-2 not-italic text-base-content flex items-center {is_button ? 'cursor-pointer' : ''} {highlighted_indexes?.has(i) ? 'bg-error/20' : ''}"
	>
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
	</svelte:element>
{/each}

<style>
	.entity-Prop {
		opacity: 0.6;
	}
</style>
