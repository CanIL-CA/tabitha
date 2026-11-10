<script lang="ts">
	import type { PageSourceEntity } from '#lib/types.js'
	import { get_selected_entity } from '#lib/data/selected_entity.svelte.js'
	import SidebarDetail from '#lib/sidebar/SidebarDetail.svelte'
	import SidebarEntityDisplay from '#lib/sidebar/SidebarEntityDisplay.svelte'
	import ConceptDetails from '#lib/sidebar_edit/ConceptDetails.svelte'
	import AllSenseDetails from '#lib/sidebar_edit/AllSenseDetails.svelte'
	import FeaturesDetails from '#lib/sidebar_edit/FeaturesDetails.svelte'
	import NounListDetails from '#lib/sidebar_edit/NounListDetails.svelte'
	import PairingDetails from '#lib/sidebar_edit/PairingDetails.svelte'
	import { get_sidebar_slot } from '#lib/sidebar_context.svelte.js'

	const selected_entity = get_selected_entity()
	let entity = $derived(selected_entity.current)
	
	const sidebar_slot = get_sidebar_slot()
	sidebar_slot.heading = 'Constituent Inspector'
	sidebar_slot.onclose = () => selected_entity.clear()

	function can_have_pairing(entity: PageSourceEntity) {
		return ['Noun', 'Verb', 'Adjective', 'Adverb'].includes(entity.concept?.part_of_speech ?? '')
	}
</script>

{#if entity}
	<!--Entity Display-->
	<section class="my-5 flex items-center gap-2">
		<SidebarEntityDisplay {entity} />
		{#if selected_entity.count > 1}
			<span class="badge badge-neutral">+{selected_entity.count - 1}</span>
		{/if}
	</section>

	<section>
		<!--Ontology Details (if present)-->
		{#if entity.concept}
			<SidebarDetail summary_title="Concept Details">
				{#snippet details_content()}
					<ConceptDetails data={entity!} />
				{/snippet}
			</SidebarDetail>
			<AllSenseDetails data={entity} field="concept" title="All Senses" />
		{/if}

		<!--Ontology Details for Pairing (if present)-->
		{#if entity.pairing_concept}
			<SidebarDetail summary_title="Pairing Details">
				{#snippet details_content()}
					<PairingDetails data={entity!} />
				{/snippet}
			</SidebarDetail>
			<AllSenseDetails data={entity} field="pairing_concept" title="Pairing - All Senses" />
		{:else if can_have_pairing(entity)}
			<SidebarDetail summary_title="Add Pairing">
				{#snippet details_content()}
					<PairingDetails data={entity!} />
				{/snippet}
			</SidebarDetail>
		{/if}

		<!--Noun List Index-->
		{#if entity.category === 'Noun'}
			<SidebarDetail summary_title="Noun List Index">
				{#snippet details_content()}
					<NounListDetails data={entity!} />
				{/snippet}
			</SidebarDetail>
		{/if}

		<!--Features-->
		{#if entity.features.length > 0}
			<SidebarDetail summary_title="Features" start_open={true}>
				{#snippet details_content()}
					<FeaturesDetails data={entity!} />
				{/snippet}
			</SidebarDetail>
		{/if}
	</section>
{/if}