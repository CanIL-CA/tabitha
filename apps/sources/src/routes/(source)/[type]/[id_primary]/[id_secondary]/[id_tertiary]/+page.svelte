<script lang="ts">
	import { OntologySenses, set_ontology_senses } from '#lib/data/ontology_senses_context.svelte.js'
	import { SelectedEntity, set_selected_entity } from '#lib/data/selected_entity.svelte.js'
	import { SourceEntities } from '#lib/index.js'
	import SelectedEntitySidebar from '#lib/sidebar/SelectedEntitySidebar.svelte'
	import Icon from '@iconify/svelte'

	let { data } = $props()

	set_ontology_senses(new OntologySenses(() => data.ontology_senses))

	let source = $derived(data.source)

	const selected_entity = new SelectedEntity(() => data.source.parsed_semantic_encoding)
	set_selected_entity(selected_entity)
	let sidebar_open = $derived(selected_entity.current !== null)
</script>

{#if source.status !== 'Ready to Translate' && source.parsed_semantic_encoding.length > 0}
	{@const time_note = source.status === 'Final Review in Progress' ? 'almost' : 'not yet'}
	<div role="alert" class="alert alert-warning">
		<Icon icon="mdi:alert-outline" class="h-6 w-6" />
		<span>Source data for this verse is still being reviewed, and is {time_note} ready for translation.</span>
	</div>
{:else if source.status === 'Not Started'}
	<div class="flex justify-center">
		<div class="prose max-w-full">
			<p>No source data yet for this verse.</p>
		</div>
	</div>
{:else if source.status !== 'Ready to Translate'}
	<div class="flex justify-center">
		<div class="prose max-w-full">
			<p>Source data for this verse is currently being developed.</p>
		</div>
	</div>
{/if}

{#if source.phase_1_encoding.length > 0}
	<div class="flex flex-col gap-2 bg-base-100 shadow-sm rounded-box px-4 py-4 my-3">
		<span class="label font-semibold">Phase 1 encoding (may be out of date)</span>
		<p>{source.phase_1_encoding}</p>
	</div>
{/if}

{#if source.parsed_semantic_encoding.length > 0}
	<div class="flex h-screen">
		<div class="overflow-y-auto transition-all duration-300 flex-[1_1_auto]" style="margin-right: {sidebar_open ? '24rem' : '0'};">
			<SourceEntities source_entities={source.parsed_semantic_encoding} />
		</div>
		{#if sidebar_open}
			<SelectedEntitySidebar />
		{/if}
	</div>
{/if}
