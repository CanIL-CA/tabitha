<script lang="ts">
	import type { CheckerToken } from '@tabitha/types'
	import type { PageProps } from './$types'
	import EditActionBar from '#lib/edit/EditActionBar.svelte'
	import HistoryToast from '#lib/edit/HistoryToast.svelte'
	import SelectedEntitySidebar from '#lib/sidebar_edit/SelectedEntitySidebar.svelte'
	import Icon from '@iconify/svelte'
	import SourceEntitiesEdit from '#lib/edit/SourceEntitiesEdit.svelte'
	import { EditHistory, set_edit_history } from '#lib/edit/history.svelte.js'
	import { Phase1 } from '#lib/edit/phase1.svelte.js'
	import { EntityClipboard, set_clipboard } from '#lib/edit/clipboard.svelte.js'
	import { OntologySenses, set_ontology_senses } from '#lib/data/ontology_senses_context.svelte.js'
	import { SelectedEntity, set_selected_entity } from '#lib/data/selected_entity.svelte.js'
	import ContextBridge from '#lib/ContextBridge.svelte'
	import { get_sidebar_slot } from '#lib/sidebar_context.svelte.js'
	import { getAllContexts } from 'svelte'
	import { get_pairing_separator } from '#lib/encoding/semantic_encoding.ts'

	let { data }: PageProps = $props()

	set_ontology_senses(new OntologySenses(() => data.ontology_senses))
	set_clipboard(new EntityClipboard())

	let phase1 = $derived(data.show_phase1 ? new Phase1(data.source.phase_1_encoding) : null)

	let edit_history = $derived(new EditHistory({
		source_entities: data.source.parsed_semantic_encoding,
	}))
	set_edit_history(() => edit_history)

	const selected_entity = new SelectedEntity(() => edit_history.current.source_entities)
	set_selected_entity(selected_entity)

	const sidebar = get_sidebar_slot()
	const contexts = getAllContexts()

	$effect(() => {
		sidebar.content = selected_entity.current ? sidebar_content : undefined
		return () => sidebar.content = undefined
	})

	function get_token_text(token: CheckerToken) {
		let parts = [token.token]
		if (token.pairing) {
			const separator = get_pairing_separator({ pairing_type: token.pairing_type, style: 'phase1' })
			parts = [...parts, separator, token.pairing.token]
		}
		if (token.pronoun) {
			parts = [token.pronoun.token, '(', ...parts, ')']
		}
		return parts.join('')
	}
</script>

{#snippet sidebar_content()}
	<ContextBridge {contexts}>
		<SelectedEntitySidebar />
	</ContextBridge>
{/snippet}

<EditActionBar nav_data={data.nav_data} {phase1} />

<HistoryToast />

<main class="mx-8 mt-6 flex-1">
	{#if phase1?.analyze_result?.status === 'error' && !phase1.error_dismissed}
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

	<div class="grid {phase1 ? 'grid-cols-2' : 'grid-cols-1'} gap-8">
		{#if phase1}
			<div class="flex flex-col gap-2">
				<div class="ms-0.5">
					<span class="label font-semibold">Input Text (Phase 1)</span>
				</div>

				<textarea
					bind:value={phase1.text}
					class="textarea textarea-bordered textarea-lg text-base field-sizing-content w-full"></textarea>
			</div>
		{/if}

		<div class="flex flex-col gap-2">
			<div class="ms-0.5">
				<span class="label font-semibold">Generated English (coming soon)</span>
			</div>

			<textarea disabled class="textarea textarea-bordered textarea-lg text-base field-sizing-content w-full"></textarea>
		</div>
	</div>

	{#if phase1?.analyze_result && phase1.token_messages.length}
		<div class="divider my-2"></div>
		<div>
			{#each phase1.analyze_result.tokens as token, i}
				{@const msg = phase1.token_messages.find(({ token_index }) => i === token_index)?.message}
				{@const text = get_token_text(token)}
				{#if !msg}
					<span>{text}{' '}</span>
				{:else if msg.label === 'error'}
					<span class="text-error font-semibold">{text}{' '}</span>
				{:else}
					<span class="text-warning font-semibold">{text}{' '}</span>
				{/if}
			{/each}
		</div>

		<div>
			{#each phase1.token_messages as token_message (token_message)}
				{@const { message, token_index } = token_message}
				{@const is_error = message.label === 'error'}
				{@const token = get_token_text(phase1.analyze_result.tokens[token_index])}
				<div class="alert alert-soft {is_error ? 'alert-error' : 'alert-warning'} shadow-lg my-1">
					<div class="flex items-center gap-4">
						<Icon icon="mdi:alert-circle-outline" class="h-5 w-5" />
						<span>{message.message} <sup>(token: "{token}")</sup></span>
						<button onclick={() => phase1.dismiss_message(token_message)} class="btn btn-xs btn-ghost italic">
							Dismiss
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}

	<div class="divider my-2"></div>

	<div id="entity-container">
		<SourceEntitiesEdit bind:source_entities={edit_history.current.source_entities} />
	</div>
</main>
