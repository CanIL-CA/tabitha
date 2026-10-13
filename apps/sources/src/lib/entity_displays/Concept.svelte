<script lang="ts">
	import type { PageSourceEntity } from '#lib/types.js'
	import Features from './Features.svelte'
	import HoverPopup from './HoverPopup.svelte'
	import OntologyResult from './OntologyResult.svelte'

	let { source_entity }: { source_entity: PageSourceEntity } = $props()

</script>

<div class="badge badge-lg rounded-full border-base-content badge-outline mx-1 py-5 text-md entity-{source_entity.category_abbr}">
	<HoverPopup>
		{#snippet button_content()}
			<span class="pe-2 my-4">
				{source_entity.category_abbr}
				{#if source_entity.noun_list_index}
					<sub class="-bottom-1.5 -left-1 italic">{source_entity.noun_list_index}</sub>
				{/if}
			</span>
		{/snippet}
		{#snippet dropdown_content()}
			<Features {source_entity} classes="text-base-content" />
		{/snippet}
	</HoverPopup>

	<div class="my-4">
		{#if source_entity.pairing_concept === null && source_entity.concept}
			<OntologyResult data={source_entity.concept} />
		{:else if source_entity.concept && source_entity.pairing_concept}
			{@const separator = source_entity.pairing_type === 'dynamic-literal' ? '\\' : '/'}
			<div class="join">
				<OntologyResult data={source_entity.concept} />
				<span class="px-1">{separator}</span>
				<OntologyResult data={source_entity.pairing_concept} />
			</div>
		{/if}
	</div>
</div>
