<script lang="ts">
	import type { PageSourceEntity } from '#lib/types.js'
	import Features from './Features.svelte'
	import HoverPopup from './HoverPopup.svelte'
	import { get_display_labels } from './display_labels'
	import { Punctuation } from '@tabitha/ui'

	let { source_entity }: { source_entity: PageSourceEntity } = $props()

	let feature_code_display = $derived(source_entity.category === 'Noun Phrase' ? `-${source_entity.feature_codes[1]}` : '')

	let bracket_entity = $derived({ ...source_entity, value: '[' })
	let labels = $derived(get_display_labels(source_entity))
</script>

<div class="inline-flex items-center gap-1 entity-{source_entity.boundary_category}">
	<Punctuation source_entity={bracket_entity} size={source_entity.value === '{' ? 'lg' : 'md'} />
	<HoverPopup>
		{#snippet button_content()}
			{#if labels.length === 0}
				<span class="font-semibold -ms-1">{source_entity.category_abbr}{feature_code_display}</span>
			{:else if labels.length === 1}
				<!--Stack the category and the single label-->
				<div class="flex flex-col">
					<span class="font-semibold -ms-1">{source_entity.category_abbr}{feature_code_display}</span>
					<span class="font-mono -ms-1">{labels[0]}</span>
				</div>
			{:else}
				<!--Stack the labels beside the category-->
				<div class="flex items-center gap-2">
					<span class="font-semibold -ms-1">{source_entity.category_abbr}{feature_code_display}</span>
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
