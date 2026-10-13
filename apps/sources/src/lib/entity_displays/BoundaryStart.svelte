<script lang="ts">
	import type { PageSourceEntity } from '#lib/types.js'
	import Features from './Features.svelte'
	import HoverPopup from './HoverPopup.svelte'
	import { Punctuation } from '@tabitha/ui'

	let { source_entity }: { source_entity: PageSourceEntity } = $props()

	let feature_code_display = $derived(source_entity.category === 'Noun Phrase' ? `-${source_entity.feature_codes[1]}` : '')

	let bracket_entity = $derived({ ...source_entity, value: '[' })
</script>

<div class="inline-flex items-center gap-1 entity-{source_entity.boundary_category}">
	<Punctuation source_entity={bracket_entity} size={source_entity.value === '{' ? 'lg' : 'md'} />
	<HoverPopup>
		{#snippet button_content()}
			<span class="font-semibold -ms-1">{source_entity.category_abbr}{feature_code_display}</span>
		{/snippet}
		{#snippet dropdown_content()}
			<Features {source_entity} />
		{/snippet}
	</HoverPopup>
</div>
