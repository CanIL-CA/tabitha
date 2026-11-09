<script lang="ts">
	import { PUBLIC_EDITOR_API_HOST } from '$app/env/public'
	import { create_editor_client, create_sources_client } from '@tabitha/api-client'
	import type { EditorCheckResult, CheckerMessage, CheckerToken } from '@tabitha/types'
	import type { PageProps } from './$types'
	import HistoryTracking from '#lib/edit/HistoryTracking.svelte'
	import SelectedEntitySidebar from '#lib/sidebar_edit/SelectedEntitySidebar.svelte'
	import Icon from '@iconify/svelte'
	import SourceEntitiesEdit from '#lib/edit/SourceEntitiesEdit.svelte'
	import { structure_entities } from '#lib/encoding/structured.js'
	import { EditHistory, set_edit_history } from '#lib/edit/history.svelte.js'
	import { EntityClipboard, set_clipboard } from '#lib/edit/clipboard.svelte.js'
	import { OntologySenses, set_ontology_senses } from '#lib/data/ontology_senses_context.svelte.js'
	import { SelectedEntity, set_selected_entity } from '#lib/data/selected_entity.svelte.js'
	import { fetch_ontology_data_for_all } from '#lib/data/api_lookups.ts'
	import ContextBridge from '#lib/ContextBridge.svelte'
	import { get_sidebar_slot } from '#lib/sidebar_context.svelte.js'
	import { getAllContexts } from 'svelte'

	const editor_client = create_editor_client({ base_url: PUBLIC_EDITOR_API_HOST })
	const sources_client = create_sources_client({ base_url: '/' })

	let { data }: PageProps = $props()

	const senses = set_ontology_senses(new OntologySenses(() => data.ontology_senses))
	set_clipboard(new EntityClipboard())

	let phase1_text = $derived(data.source.phase_1_encoding)

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

	let is_checked = $state(false)
	let checking = $state(false)
	let check_result = $state<EditorCheckResult | null>(null)
	let errors_and_warnings = $state<[CheckerMessage, number][]>([])

	let analyzing = $state(false)
	let api_error = $state<string | null>(null)

	function text_changed() {
		is_checked = false
		api_error = null
	}

	async function check_text() {
		api_error = null
		check_result = null
		checking = true

		try {
			const check_response = await editor_client.check_text({ text: phase1_text })
			if (!check_response) {
				throw new Error('Checker API request failed')
			}

			check_response.tokens = check_response.tokens.flatMap(flatten_tokens)

			errors_and_warnings = check_response.tokens
				.flatMap((token, i) => {
					const messages = [...token.messages, ...token.pairing?.messages ?? [], ...token.pronoun?.messages ?? []]
					return messages.map<[CheckerMessage, number]>(msg => [msg, i])
				})
				.filter(([msg]) => ['error', 'warning'].includes(msg.label))

			check_result = check_response
			is_checked = true
		} catch (err) {
			api_error = err instanceof Error ? err.message : 'Failed to check text'
		} finally {
			checking = false
		}

		function flatten_tokens(token: CheckerToken): CheckerToken[] {
			if (token.sub_tokens.length) {
				return token.sub_tokens.flatMap(flatten_tokens)
			} else {
				return [token]
			}
		}
	}

	async function analyze_text() {
		if (!is_checked) {
			if (!confirm('The text has not been checked yet. Are you sure you want to continue?')) {
				return
			}
		}
		if (check_result && check_result.status !== 'ok') {
			if (!confirm(`The checker found some ${check_result?.status} in the text. Are you sure you want to continue?`)) {
				return
			}
		}

		api_error = null
		check_result = null
		analyzing = true

		try {
			const result = await sources_client.analyze_text(phase1_text)
			if (!result) {
				throw new Error('Analyze API failed')
			}

			const analyzed_entities = result.source_entities.map(entity => ({ ...entity, id: -1, parent_id: -1, boundary_category: '' }))
			structure_entities(analyzed_entities)
			
			const results_by_stem = await fetch_ontology_data_for_all(analyzed_entities)
			senses.remember(Object.values(results_by_stem).flat())

			edit_history.record({ action: 'analyze', ids_before: [] })
			edit_history.current = { source_entities: analyzed_entities }
		} catch (err) {
			api_error = err instanceof Error ? err.message : 'Failed to analyze text'
		} finally {
			analyzing = false
		}
	}

	function get_token_text(token: CheckerToken) {
		let parts = [token.token]
		if (token.pairing) {
			const separator = token.pairing_type === 'dynamic-literal' ? '|' : '/'
			parts = [...parts, separator, token.pairing.token]
		}
		if (token.pronoun) {
			parts = [token.pronoun.token, '(', ...parts, ')']
		}
		return parts.join('')
	}
</script>

{#if api_error}
	<div role="alert" class="alert alert-error my-3">
		<Icon icon="mdi:alert-circle-outline" class="h-6 w-6" />
		<span>API Request Failed: {api_error}</span>
		<button onclick={() => api_error = null} class="btn btn-xs btn-ghost">Dismiss</button>
	</div>
{/if}

{#snippet sidebar_content()}
	<ContextBridge {contexts}>
		<SelectedEntitySidebar />
	</ContextBridge>
{/snippet}

<div class="flex gap-4 mt-2">
	<button onclick={ check_text } type="submit" disabled={checking} class="btn btn-sm btn-accent min-w-30">
		Check Phase 1
		{#if checking}
			<Icon icon="line-md:loading-twotone-loop" class="h-5 w-5" />
		{:else if is_checked && check_result?.status === 'ok'}
			<Icon icon="mdi:check-bold" class="h-5 w-5" />
		{:else}
			<Icon icon="mdi:format-list-checks" class="h-5 w-5" />
		{/if}
	</button>

	<button onclick={ analyze_text } type="submit" disabled={analyzing} class="btn btn-sm btn-primary min-w-30">
		Analyze
		{#if analyzing}
			<Icon icon="line-md:loading-twotone-loop" class="h-5 w-5" />
		{:else}
			<Icon icon="mdi:magnify" class="h-5 w-5" />
		{/if}
	</button>

	<div data-tip="coming soon" class="tooltip">
		<button type="submit" disabled class="btn btn-sm btn-secondary min-w-30">
			Generate
			<Icon icon="mdi:play-circle-outline" class="h-5 w-5" />
		</button>
	</div>

	<div data-tip="coming soon" class="tooltip">
		<button type="submit" disabled class="btn btn-sm btn-primary min-w-30">
			Save
			<Icon icon="mdi:content-save-outline" class="h-5 w-5" />
		</button>
	</div>
	
	<HistoryTracking />
</div>

<div class="divider my-1"></div>

<div class="grid grid-cols-2 gap-8 mt-4">
	<div class="flex flex-col gap-2">
		<div class="ms-0.5">
			<span class="label font-semibold">Input Text (Phase 1)</span>
		</div>

		<textarea
			bind:value={phase1_text}
			oninput={text_changed}
			class="textarea textarea-bordered textarea-lg text-base field-sizing-content w-full"></textarea>
	</div>

	<div class="flex flex-col gap-2">
		<div class="ms-0.5">
			<span class="label font-semibold">Generated English (coming soon)</span>
		</div>

		<textarea disabled class="textarea textarea-bordered textarea-lg text-base field-sizing-content w-full"></textarea>
	</div>
</div>

{#if check_result && errors_and_warnings.length}
	<div class="divider my-2"></div>
	<div>
		{#each check_result.tokens as token, i}
			{@const msg = errors_and_warnings.find(([, token_index]) => i === token_index)?.[0]}
			{@const text = get_token_text(token)}
			{#if msg?.label === 'error'}
				<span class="text-error">{text}{' '}</span>
			{:else if msg?.label === 'warning'}
				<span class="text-warning">{text}{' '}</span>
			{:else}
				<span>{text}{' '}</span>
			{/if}
		{/each}
	</div>

	<div>
		{#each errors_and_warnings as [message, token_index]}
			{@const is_error = message.label === 'error'}
			{@const token = get_token_text(check_result.tokens[token_index])}
			<div class="alert alert-soft {is_error ? 'alert-error' : 'alert-warning'} shadow-lg my-1">
				<div class="flex items-center gap-2">
					<Icon icon="mdi:alert-circle" class="h-5 w-5" />
					<span>{message.message} <sup>(token: "{token}")</sup></span>
				</div>
			</div>
		{/each}
	</div>
{/if}

<div class="divider my-2"></div>

{#if !analyzing}
	<div id="entity-container">
		<SourceEntitiesEdit bind:source_entities={edit_history.current.source_entities} />
	</div>
{/if}
