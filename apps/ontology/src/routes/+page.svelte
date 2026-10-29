<script lang="ts">
	import Icon from '@iconify/svelte'
	import { page } from '$app/state'
	import { SummaryCard } from '#lib/card/index.js'
	import { DisplayPreference, Table } from '#lib/search/index.js'
	import AddConceptButton from '#lib/AddConceptButton.svelte'
	import type { PageProps } from './$types'

	let { data }: PageProps = $props()

	let display_preference = $state<'grid' | 'table'>('grid')

	let searched = $derived(!!page.url.search)
	let matches = $derived(data.results)
	let found = $derived(!!matches.length)
	let icon = $derived(`material-symbols:${found ? 'check-circle' : 'warning'}-outline-rounded`)
</script>

<header class="flex justify-between">
	<em class="badge badge-lg gap-2 transition-opacity duration-200 {searched ? 'opacity-100' : 'opacity-0'} {found ? 'badge-success' : 'badge-warning'}">
		<Icon {icon} />

		<strong>{matches.length}</strong> results
	</em>

	<div class="flex items-center gap-4">
		{#if data.user?.permissions.has_protected_access}
			<AddConceptButton user={data.user!} />
		{/if}

		<DisplayPreference bind:preference={display_preference} />
	</div>
</header>

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
