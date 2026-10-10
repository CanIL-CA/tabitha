<script lang="ts">
	import type { PageSourceEntity } from '#lib/types.js'
	import { PUBLIC_EDITOR_API_HOST } from '$env/static/public'
	import { create_editor_client, create_sources_client } from '@tabitha/api-client'
	import type { EditorCheckResult, CheckerMessage, CheckerToken, NounListEntry } from '@tabitha/types'
	import { Navigation } from '#lib/index.js'
	import type { PageProps } from './$types'
	import Settings from '#lib/settings/Settings.svelte'
	import Sidebar from '#lib/sidebar_edit/Sidebar.svelte'
	import Icon from '@iconify/svelte'
	import SourceEntitiesEdit from '#lib/edit/SourceEntitiesEdit.svelte'
	import { structure_entities } from '#lib/encoding/structured.js'

	const editor_client = create_editor_client({ base_url: PUBLIC_EDITOR_API_HOST })
	const sources_client = create_sources_client({ base_url: '/' })

	let { data }: PageProps = $props()

	let phase1_text = $state('')
	let source_entities = $state<PageSourceEntity[]>([])
	let noun_list = $state<NounListEntry[]>([])

	$effect(() => {
		phase1_text = data.source.phase_1_encoding
		source_entities = data.source.parsed_semantic_encoding
		noun_list = data.source.noun_list
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
				.flatMap((token, i) => token.messages.map<[CheckerMessage, number]>(msg => [msg, i]))
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

			source_entities = result.source_entities.map(entity => ({ ...entity, id: -1, parent_id: -1, boundary_category: '' }))
			structure_entities(source_entities)

			noun_list = result.noun_list
		} catch (err) {
			api_error = err instanceof Error ? err.message : 'Failed to analyze text'
		} finally {
			analyzing = false
		}
	}

	let selected_entity: PageSourceEntity|null = $state(null)
	let sidebar_open = $state(false)

	function on_entity_select(entity: PageSourceEntity|null) {
		selected_entity = entity
		sidebar_open = !!entity
	}

	function on_sidebar_close() {
		selected_entity = null
		sidebar_open = false
	}
</script>

<div class="flex flex-row flex-wrap max-w-full">
	<Navigation nav_data={data.nav_data} url_end="/edit" />

	<button onclick={ check_text } type="submit" disabled={checking} class="btn btn-primary ml-8">
		Check
		{#if checking}
			<Icon icon="line-md:loading-twotone-loop" class="h-6 w-6" />
		{:else if is_checked && check_result?.status === 'ok'}
			<Icon icon="mdi:check-bold" class="h-6 w-6" />
		{:else}
			<Icon icon="mdi:format-list-checks" class="h-6 w-6" />
		{/if}
	</button>

	<button onclick={ analyze_text } type="submit" disabled={analyzing} class="btn btn-secondary ml-4">
		Analyze
		{#if analyzing}
			<Icon icon="line-md:loading-twotone-loop" class="h-6 w-6" />
		{:else}
			<Icon icon="mdi:magnify" class="h-6 w-6" />
		{/if}
	</button>

	<div class="ml-4">
		<Settings />
	</div>
</div>

{#if api_error}
	<div role="alert" class="alert alert-error my-3">
		<Icon icon="mdi:alert-circle-outline" class="h-6 w-6" />
		<span>API Request Failed: {api_error}</span>
		<button onclick={() => api_error = null} class="btn btn-xs btn-ghost">Dismiss</button>
	</div>
{/if}

<div class="divider my-2"></div>
<div>
	<p class="label">Input Text</p>
	<p>
		<textarea bind:value={phase1_text} oninput={text_changed} rows="3" class="textarea textarea-bordered textarea-lg w-4/5"></textarea>
	</p>
</div>

{#if check_result && errors_and_warnings.length}
	<div class="divider my-2"></div>
	<div>
		<p>
			{#each check_result.tokens as token, i}
				{@const msg = errors_and_warnings.find(([, token_index]) => i === token_index)?.[0]}
				{#if msg?.label === 'error'}
					<span class="text-error">{token.token}&nbsp;</span>
				{:else if msg?.label === 'warning'}
					<span class="text-warning">{token.token}&nbsp;</span>
				{:else}
					<span>{token.token}&nbsp;</span>
				{/if}
			{/each}
		</p>
	</div>

	<div>
		{#each errors_and_warnings as [message, token_index]}
			{@const is_error = message.label === 'error'}
			{@const token = check_result.tokens[token_index]}
			<div class="alert {is_error ? 'alert-error' : 'alert-warning'} shadow-lg my-2">
				<div>
					<Icon icon={is_error ? 'mdi:close-circle' : 'mdi:alert-circle'} class="h-6 w-6" />
					<span>{message.message} <sup>(token: "{token.token}")</sup></span>
				</div>
			</div>
		{/each}
	</div>
{/if}

{#if !analyzing}
	<div class="divider my-2"></div>
	<div class="flex h-screen">
		<div id="entity-container" class="overflow-y-auto transition-all duration-300 flex-[1_1_auto]" style="margin-right: {sidebar_open ? '24rem' : '0'};">
			<SourceEntitiesEdit bind:source_entities {selected_entity} {on_entity_select} />
		</div>
		{#if sidebar_open}
			<Sidebar bind:entity={selected_entity} onclose={on_sidebar_close} bind:noun_list />
		{/if}
	</div>
{/if}
