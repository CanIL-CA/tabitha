<script lang="ts">
	import Icon from '@iconify/svelte'
	import { page } from '$app/state'
	import { DisplayPreference, SummaryCard, Table } from '#lib/index.js'
	import { merge_pending_changes } from '#lib/offline/pending.js'
	import type { Concept } from '#lib/types.js'
	import type { PageProps } from './$types'

	let { data }: PageProps = $props()

	let display_preference = $state<'grid' | 'table'>('grid')

	let searched = $derived(!!page.url.search)
	// svelte-ignore state_referenced_locally
	let matches = $state<Concept[]>(data.results)
	let found = $derived(!!matches.length)
	let icon = $derived(`material-symbols:${found ? 'check-circle' : 'warning'}-outline-rounded`)

	$effect(() => {
		// this is only in IndexedDB on this device, so the server can't have included it in `data.results` already
		merge_pending_changes(data.results).then(results => matches = results)
	})
</script>

<header class="flex justify-between">
	<em class="badge badge-lg gap-2 transition-opacity duration-200 {searched ? 'opacity-100' : 'opacity-0'} {found ? 'badge-success' : 'badge-warning'}">
		<Icon {icon} />

		<strong>{matches.length}</strong> results
	</em>

	<DisplayPreference bind:preference={display_preference} />
</header>

{#if data.can_add}
	<section>
		<a href="/protected/concept/create" class="btn">
			<Icon icon="material-symbols:add" class="w-5 h-5" />
			Add Concept
		</a>
	</section>
{/if}

{#if display_preference === 'grid'}
	<section class="mt-8 flex flex-row flex-wrap gap-10">
		{#each matches as concept (`${concept.stem}-${concept.sense}-${concept.part_of_speech}`)}
			<SummaryCard {concept} show_how_to={matches.length <= 5} />
		{/each}
	</section>
{:else}
	<section class="prose mt-8 max-w-none overflow-x-auto">
		<Table concepts={matches} />
	</section>
{/if}
