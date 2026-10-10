<script lang="ts">
	import type { NounListEntry } from '@tabitha/types'
	import type { PageSourceEntity } from '#lib/types.js'
	import Icon from '@iconify/svelte'
	import SidebarDetail from '#lib/sidebar/SidebarDetail.svelte'
	import SidebarEntityDisplay from '#lib/sidebar/SidebarEntityDisplay.svelte'
	import ConceptDetails from '#lib/sidebar_edit/ConceptDetails.svelte'
	import AllSenseDetails from '#lib/sidebar_edit/AllSenseDetails.svelte'
	import FeaturesDetails from '#lib/sidebar_edit/FeaturesDetails.svelte'
	import NounListDetails from '#lib/sidebar_edit/NounListDetails.svelte'
	import PairingDetails from './PairingDetails.svelte'

	type Props = {
		entity: PageSourceEntity|null
		onclose: () => void
		noun_list: NounListEntry[]
	}
	let { entity = $bindable(), onclose, noun_list = $bindable() }: Props = $props()

	function can_have_pairing(entity: PageSourceEntity) {
		return ['Noun', 'Verb', 'Adjective', 'Adverb'].includes(entity.concept?.part_of_speech ?? '')
	}
</script>

<svelte:window onkeydown={e => e.key === 'Escape' && onclose()} />

<div class="fixed top-0 right-0 h-full w-96 bg-base-100 border-l border-base-300 shadow-xl flex flex-col">
	<button onclick={onclose} class="btn btn-circle btn-ghost btn-sm absolute right-3 top-5">
		<Icon icon="material-symbols:close" class="h-4 w-4" />
	</button>

	{#if entity}
		<div class="p-4 flex-1 overflow-auto">
			<h3 class="text-2xl font-bold">Constituent Inspector</h3>

			<!--Entity Display-->
			<section class="my-5">
				<SidebarEntityDisplay {entity} />
			</section>

			<section>
				<!--Ontology Details (if present)-->
				{#if entity.concept}
					<SidebarDetail summary_title="Concept Details">
						{#snippet details_content()}
							<ConceptDetails bind:data={entity!.concept!} />
						{/snippet}
					</SidebarDetail>
					<AllSenseDetails bind:data={entity.concept!} title="All Senses" />
				{/if}

				<!--Ontology Details for Pairing (if present)-->
				{#if entity.pairing_concept}
					<SidebarDetail summary_title="Pairing Details">
						{#snippet details_content()}
							<PairingDetails bind:data={entity!} />
						{/snippet}
					</SidebarDetail>
					<AllSenseDetails bind:data={entity.pairing_concept!} title="Pairing - All Senses" />
				{:else if can_have_pairing(entity)}
					<SidebarDetail summary_title="Add Pairing">
						{#snippet details_content()}
							<PairingDetails bind:data={entity!} />
						{/snippet}
					</SidebarDetail>
				{/if}

				<!--Noun List Index-->
				{#if entity.category === 'Noun'}
					<SidebarDetail summary_title="Noun List Index">
						{#snippet details_content()}
							<NounListDetails bind:data={entity!} bind:noun_list={noun_list} />
						{/snippet}
					</SidebarDetail>
				{/if}

				<!--Features-->
				{#if entity.features.length > 0}
					<SidebarDetail summary_title="Features" start_open={true}>
						{#snippet details_content()}
							<FeaturesDetails bind:data={entity!} />
						{/snippet}
					</SidebarDetail>
				{/if}
			</section>
		</div>
	{:else}
		<div>
			<p>No item selected.</p>
		</div>
	{/if}
	
</div>