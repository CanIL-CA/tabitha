<script lang="ts">
	import type { PageSourceEntity } from '#lib/types.js'
	import FeatureCodes from './FeatureCodes.svelte'
	import Features from './Features.svelte'
	import HoverPopup from './HoverPopup.svelte'
	import { get_display_labels } from './display_labels'
	import { Punctuation } from '@tabitha/ui'

	let { source_entity }: { source_entity: PageSourceEntity } = $props()

	let bracket_entity = $derived({ ...source_entity, value: '[' })
	let labels = $derived(get_display_labels(source_entity))
</script>

{#snippet category_and_codes()}
	<span class="-ms-1">
		<span class="font-semibold">{source_entity.category_abbr}</span><FeatureCodes {source_entity} />
	</span>
{/snippet}

<div class="inline-flex items-center gap-1 entity-{source_entity.boundary_category}">
	<Punctuation source_entity={bracket_entity} size={source_entity.value === '{' ? 'lg' : 'md'} />
	<HoverPopup>
		{#snippet button_content()}
			{#if labels.length === 0}
				{@render category_and_codes()}
			{:else if labels.length === 1}
				<!--Stack the category and the single label-->
				<div class="flex flex-col">
					{@render category_and_codes()}
					<span class="font-mono -ms-1">{labels[0]}</span>
				</div>
			{:else}
				<!--Stack the labels beside the category-->
				<div class="flex items-center gap-2">
					{@render category_and_codes()}
					<div class="flex flex-col">
						{#each labels as label}
							<span class="font-mono">{label}</span>
						{/each}
					</div>
				</div>
			{/if}
		{/snippet}
		{#snippet dropdown_content()}
			<Features {source_entity} />
		{/snippet}
	</HoverPopup>
</div>
