<script lang="ts">
	import type { PageSourceEntity } from '#lib/types.js'
	import { is_boundary_start } from '#lib/encoding/entity_filters.js'
	import { Punctuation } from '@tabitha/ui'

	let { entity }: { entity: PageSourceEntity } = $props()
</script>

<div class="entity-{entity.boundary_category}">
	{#if is_boundary_start(entity)}
		{@const is_main_clause = entity.value === '{'}
		<div class="inline-flex items-center pe-2">
			<Punctuation source_entity={{ ...entity, value: '[' }} size={is_main_clause ? 'lg' : 'md'} />
			<span class="font-semibold -ms-1">{entity.category_abbr}</span>
			<span class="mx-2 tracking-widest">...</span>
			<Punctuation source_entity={{ ...entity, value: ']' }} size={is_main_clause ? 'lg' : 'md'} />
		</div>
	{:else if entity.concept}
		<div class="badge badge-lg rounded-full border-base-content badge-outline mx-1 py-5 text-md entity-{entity.category_abbr}">
			<span class="pe-2 py-4">
				{entity.category_abbr}
				{#if entity.noun_list_index}
					<sub class="-bottom-1.5 -left-1 italic">{entity.noun_list_index}</sub>
				{/if}
			</span>

			<div class="py-4">
				{#if !entity.pairing_concept}
					<span>{entity.concept.stem}-{entity.concept.sense}</span>
				{:else}
					{@const separator = entity.pairing_type === 'dynamic-literal' ? '\\' : '/'}
					<div class="join">
						<span>{entity.concept.stem}-{entity.concept.sense}</span>
						<span class="px-1">{separator}</span>
						<span>{entity.pairing_concept.stem}-{entity.pairing_concept.sense}</span>
					</div>
				{/if}
			</div>
		</div>
	{:else}
		<Punctuation source_entity={entity} />
	{/if}
</div>