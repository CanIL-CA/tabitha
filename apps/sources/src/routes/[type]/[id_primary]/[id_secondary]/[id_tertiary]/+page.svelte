<script lang="ts">
	import type { PageSourceEntity } from '#lib/types.js'
	import { Navigation, SourceEntities } from '#lib/index.js'
	import Settings from '#lib/settings/Settings.svelte'
	import Sidebar from '#lib/sidebar/Sidebar.svelte'
	import Icon from '@iconify/svelte'

	let { data } = $props()

	let source = $derived(data.source)
	let nav_data = $derived(data.nav_data)

	let selected_entity = $state<PageSourceEntity | null>(null)
	let sidebar_open = $state(false)

	function on_entity_select(entity: PageSourceEntity) {
		selected_entity = entity
		sidebar_open = true
	}

	function on_sidebar_close() {
		selected_entity = null
		sidebar_open = false
	}
</script>

<svelte:head>
	<title>{source.id_primary} {source.id_secondary}:{source.id_tertiary} - TaBiThA Sources</title>
</svelte:head>

<div class="grid justify-items-stretch grid-cols-3 pb-5">
	<div class="justify-self-start">
		<Settings />
	</div>
	<div class="justify-self-center">
		<Navigation {nav_data} />
	</div>
</div>

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

{#if source.parsed_semantic_encoding.length > 0}
	<div class="flex h-screen">
		<div class="overflow-y-auto transition-all duration-300 flex-[1_1_auto]" style="margin-right: {sidebar_open ? '24rem' : '0'};">
			<SourceEntities source_entities={source.parsed_semantic_encoding} {selected_entity} {on_entity_select} />
		</div>
		{#if sidebar_open}
			<Sidebar entity={selected_entity} onclose={on_sidebar_close} noun_list={source.noun_list} />
		{/if}
	</div>
{/if}
