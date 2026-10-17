<script lang="ts">
	import Sidebar from '#lib/Sidebar.svelte'
	import SidebarDetail from './SidebarDetail.svelte'
	import ConceptDetails from './ConceptDetails.svelte'
	import AllSenseDetails from './AllSenseDetails.svelte'
	import FeaturesDetails from './FeaturesDetails.svelte'
	import SidebarEntityDisplay from './SidebarEntityDisplay.svelte'
	import NounListDetails from './NounListDetails.svelte'
	import PairingDetails from './PairingDetails.svelte'
	import { get_selected_entity } from '#lib/data/selected_entity.svelte.js'

	const selected_entity = get_selected_entity()
	let entity = $derived(selected_entity.current)
</script>

{#if entity}
	<Sidebar heading='Constituent Inspector' onclose={() => selected_entity.clear()}>
		<!--Entity Display-->
		<section class="my-5">
			<SidebarEntityDisplay {entity} />
		</section>

		<section>
			<!--Ontology Details (if present)-->
			{#if entity.concept}
				<SidebarDetail summary_title="Concept Details">
					{#snippet details_content()}
						<ConceptDetails data={entity.concept!} />
					{/snippet}
				</SidebarDetail>
				<AllSenseDetails data={entity.concept!} title="All Senses" />
			{/if}

			<!--Ontology Details for Pairing (if present)-->
			{#if entity.pairing_concept}
				<SidebarDetail summary_title="Pairing Details">
					{#snippet details_content()}
						<PairingDetails data={entity!} />
					{/snippet}
				</SidebarDetail>
				<AllSenseDetails data={entity.pairing_concept!} title="Pairing - All Senses" />
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
	</Sidebar>
{/if}