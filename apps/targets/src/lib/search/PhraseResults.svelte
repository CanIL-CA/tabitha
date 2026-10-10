<script lang="ts">
	import Icon from '@iconify/svelte'
	import { book_order_index } from '@tabitha/types/patterns'
	import { track_scripture_view } from '#lib/api_bible/fums.js'
	import PhraseResultCard from './PhraseResultCard.svelte'
	import type { PhraseSearchResults } from '#lib/types.js'

	type Props = {
		results: PhraseSearchResults
		search_regex: RegExp
		highlight_terms: Set<string>
		project: string
	}

	let { results, search_regex, highlight_terms, project }: Props = $props()

	let sorted_hits = $derived(results.hits.toSorted((a, b) => book_order_index(a) - book_order_index(b)))
	let found = $derived(results.hits.length > 0)

	let collapse_states = $state<boolean[]>([])

	$effect(() => {
		collapse_states = sorted_hits.map(() => false)
	})

	$effect(() => {
		if (results.fums_token && sorted_hits.length) {
			track_scripture_view(results.fums_token)
		}
	})
</script>

{#if results.notice === 'unsupported_project'}
	<aside class="alert alert-warning">
		<Icon icon="material-symbols:warning-outline-rounded" />
		<span>
			Phrase search isn't available for <strong>{project}</strong> — we have no scripture text for
			this project to search against. Try the target-text search instead.
		</span>
	</aside>
{:else if results.notice === 'unavailable'}
	<aside class="alert alert-error">
		<Icon icon="material-symbols:error-outline-rounded" />
		<span>Phrase search is unavailable right now. Please try again shortly.</span>
	</aside>
{:else}
	<header class="flex flex-wrap items-center gap-2">
		<em class="badge badge-lg gap-2" class:badge-success={found} class:badge-warning={!found}>
			<Icon icon="material-symbols:{found ? 'check-circle' : 'warning'}-outline-rounded" />
			<strong>{results.hits.length}</strong> verses with a semantic encoding
		</em>
	</header>

	{#if !results.complete}
		<aside class="alert alert-info mt-2 py-2 text-sm">
			<Icon icon="material-symbols:info-outline-rounded" />
			<span>
				This phrase is common enough that we stopped before reaching the end of the results —
				there may be more verses than the ones listed here.
			</span>
		</aside>
	{/if}

	<section class="prose mt-2 max-w-none overflow-x-auto text-pretty">
		{#each sorted_hits as hit, i (`${hit.reference.id_primary}:${hit.reference.id_secondary}:${hit.reference.id_tertiary}`)}
			<PhraseResultCard {hit} {search_regex} {highlight_terms} bind:open={collapse_states[i]} />
		{/each}
	</section>
{/if}
