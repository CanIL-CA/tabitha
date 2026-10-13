<script lang="ts">
	import { PUBLIC_ONTOLOGY_API_HOST } from '$env/static/public'
	import { SourceEntitiesPlain } from '@tabitha/ui'
	import Icon from '@iconify/svelte'
	import { fetch_source_data, get_sources_url } from './helpers'
	import type { Reference } from '@tabitha/types'

	type Props = {
		reference: Reference
		/** lowercased phrase words to highlight matching concepts against, if searching by phrase */
		highlight_terms: Set<string>
	}

	let { reference, highlight_terms }: Props = $props()

	let sources_url = $derived(get_sources_url(reference))
	let source_data_promise = $derived(fetch_source_data(reference))
</script>

<h4 class="flex justify-between">
	Semantic encoding (Phase 2)

	<a href={sources_url} target="_blank" rel="noreferrer" class="link link-accent link-hover text-sm flex items-end">
		all source details
		<Icon icon="fe:link-external" class="h-6 w-6" />
	</a>
</h4>

{#await source_data_promise}
	<p>
		<span class="loading loading-spinner text-warning"></span>
		getting the source data...
	</p>
{:then source}
	{#if source}
		<p>
			<SourceEntitiesPlain
				source_entities={source.parsed_semantic_encoding}
				ontology_base_url={PUBLIC_ONTOLOGY_API_HOST}
				{highlight_terms} />
		</p>
	{:else}
		<p>
			Could not load the source data...
		</p>
	{/if}
{/await}