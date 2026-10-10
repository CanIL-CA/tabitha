<script lang="ts">
	import type { SimplifiedEncodingEntity, SimplifiedSemanticEncoding } from '#lib/types.js'

	type Props = {
		entities: SimplifiedSemanticEncoding
	}

	let { entities }: Props = $props()

	const boundary_char_map: Record<string, string> = {
		NP: '(',
		VP: '(',
		AdjP: '(',
		AdvP: '(',
		'Phrase end': ')',
		Clause: '[',
		'Clause end': ']',
	}

	const label_map: Record<string, string> = {
		NP: 'NP',
		VP: 'VP',
		AdjP: 'AdjP',
		AdvP: 'AdvP',
		// for 'Proposition' - verb clause arguments are called 'Patient/Agent Propositions'
		Clause: 'Prop',
	}

	/**
	 * Find the parent boundary, or if the entity is a boundary, return itself
	 */
	function find_closest_boundary(index: number): SimplifiedEncodingEntity {
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
		const boundary_category = find_closest_boundary(index).category
		return `entity-${boundary_category}`
	}

	function is_boundary_start(entity: SimplifiedEncodingEntity): boolean {
		return entity.category in label_map
	}

	function is_boundary_end(entity: SimplifiedEncodingEntity): boolean {
		return entity.category.endsWith('end')
	}
</script>

{#each entities as entity, i}
	{@const boundary_char = boundary_char_map[entity.category]}
	{@const label = entity.word || label_map[entity.category] || ''}
	{@const style_class = get_style_class(i)}

	<span class="mb-1 py-2 not-italic text-base-content flex items-center">
		{#if boundary_char}
			<span class="text-3xl font-thin {style_class}">
				{boundary_char}
			</span>
		{/if}

		{#if entity.feature}
			<span class="text-md pt-2 font-medium {style_class}">
				{label}-{entity.feature.value}
			</span>
		{:else}
			<span class="text-md pt-2 font-normal {style_class}">
				{label}
			</span>
		{/if}
	</span>
{/each}

<style>
	.entity-Clause {
		opacity: 0.6;
	}
</style>