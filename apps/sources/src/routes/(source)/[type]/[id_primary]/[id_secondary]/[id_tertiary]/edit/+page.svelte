<script lang="ts">
	import type { PageProps } from './$types'
	import EditActionBar from '#lib/edit/EditActionBar.svelte'
	import HistoryToast from '#lib/edit/HistoryToast.svelte'
	import SelectedEntitySidebar from '#lib/sidebar_edit/SelectedEntitySidebar.svelte'
	import Icon from '@iconify/svelte'
	import SourceEntitiesEdit from '#lib/edit/SourceEntitiesEdit.svelte'
	import { EditHistory, set_edit_history } from '#lib/edit/history.svelte.js'
	import { Phase1 } from '#lib/edit/phase1.svelte.js'
	import { Validation } from '#lib/edit/validation.svelte.js'
	import ValidationIssues from '#lib/edit/ValidationIssues.svelte'
	import { EntityClipboard, set_clipboard } from '#lib/edit/clipboard.svelte.js'
	import { OntologySenses, set_ontology_senses } from '#lib/data/ontology_senses_context.svelte.js'
	import { SelectedEntity, set_selected_entity } from '#lib/data/selected_entity.svelte.js'
	import ContextBridge from '#lib/ContextBridge.svelte'
	import { get_sidebar_slot } from '#lib/sidebar_context.svelte.js'
	import { getAllContexts } from 'svelte'
	import GeneratePanelForEdit from '#lib/generation/GeneratePanelForEdit.svelte'
	import Phase1Panel from '#lib/edit/Phase1Panel.svelte'

	let { data }: PageProps = $props()

	const senses = new OntologySenses(() => data.ontology_senses)
	set_ontology_senses(senses)
	set_clipboard(new EntityClipboard())

	let phase1 = $derived(new Phase1({ initial_text: data.source.phase_1_encoding, allow_analyze: data.allow_analyze }))

	let edit_history = $derived(new EditHistory({
		source_entities: data.source.parsed_semantic_encoding,
	}))
	set_edit_history(() => edit_history)

	let validation = $derived(new Validation({
		source_entities: () => edit_history.current.source_entities,
		senses: () => senses.all,
		show_if_issues: data.source.parsed_semantic_encoding.length > 0,
	}))

	const selected_entity = new SelectedEntity(() => edit_history.current.source_entities)
	set_selected_entity(selected_entity)

	const sidebar = get_sidebar_slot()
	const contexts = getAllContexts()

	$effect(() => {
		sidebar.content = selected_entity.current ? sidebar_content : undefined
		return () => sidebar.content = undefined
	})
</script>

{#snippet sidebar_content()}
	<ContextBridge {contexts}>
		<SelectedEntitySidebar />
	</ContextBridge>
{/snippet}

<EditActionBar nav_data={data.nav_data} {phase1} {validation} />

<HistoryToast />

<main class="mx-8 mt-4 flex-1">
	{#if phase1.analyze_result?.status === 'error' && !phase1.error_dismissed}
		{@const encoding_message = edit_history.current.source_entities.length > 0 ? 'the existing encoding was not replaced.' : 'no encoding was produced.'}
		<div role="alert" class="alert alert-error mb-3">
			<div class="flex items-center gap-4">
				<Icon icon="mdi:alert-circle-outline" class="h-6 w-6" />
				{#if phase1.api_error}
					<span>Analyze API request failed: {phase1.api_error} - {encoding_message}</span>
				{:else}
					<span>Analyze failed - {encoding_message}</span>
				{/if}
				<button onclick={() => phase1.dismiss_error()} class="btn btn-xs btn-ghost italic">Dismiss</button>
			</div>
		</div>
	{/if}

	<div class="grid grid-cols-2 gap-4">
		<!--'self-start' prevents the panel from growing veritcally to match the other panel-->
		<div class="self-start">
			<Phase1Panel {phase1} />
		</div>

		<div class="self-start">
			<GeneratePanelForEdit reference={data.nav_data.current} {validation} />
		</div>
	</div>

	{#if validation.is_shown}
		<div class="mt-4">
			<ValidationIssues {validation} reference={data.nav_data.current} />
		</div>
	{/if}

	<div id="entity-container mt-4">
		<SourceEntitiesEdit bind:source_entities={edit_history.current.source_entities} />
	</div>
</main>
