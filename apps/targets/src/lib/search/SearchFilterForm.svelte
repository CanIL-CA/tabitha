<script lang="ts">
	import { fade } from 'svelte/transition'
	import Icon from '@iconify/svelte'
	import { PUBLIC_ONTOLOGY_API_HOST } from '$env/static/public'
	import type { FilterMap, ReturnTo } from '#lib/types.js'

	type Props = {
		searched: boolean
		found: boolean
		matches_count: number
		filtered_count: number
		return_to?: ReturnTo
		filters: FilterMap
		selected_filters: Record<string, string>
	}

	let {
		searched,
		found,
		matches_count,
		filtered_count,
		return_to,
		filters,
		selected_filters = $bindable({}),
	}: Props = $props()

	let icon = $derived(`material-symbols:${found ? 'check-circle' : 'warning'}-outline-rounded`)

	const FADE_CHARACTERISTICS = {
		delay: 100,
		duration: 700,
	}
</script>

{#if searched}
	<header class="flex justify-between">
		<em class="badge badge-lg gap-2" class:badge-success={found} class:badge-warning={!found}>
			<Icon {icon} />

			<strong>{matches_count}</strong> results
		</em>
	</header>

	<section class="pt-2 w-full flex flex-col gap-2">
		<form class="flex flex-wrap items-center gap-4 bg-base-200 p-4 rounded-box border border-base-300">
			{#if return_to?.app === 'ontology'}
				<div>
					<a href="{PUBLIC_ONTOLOGY_API_HOST}{return_to.q ? `?q=${return_to.q}&scope=stems` : '/'}" class="btn btn-primary btn-sm">
						<Icon icon="mdi:arrow-left-thin" class="h-5 w-5" />
						Return to Ontology
					</a>
				</div>

				<div class="divider divider-horizontal mx-0 hidden sm:flex"></div>
			{/if}

			{#each filters as [name, options]}
				<label class="flex flex-col gap-1">
					<span class="text-xs font-semibold uppercase tracking-wider text-base-content/70">{name}</span>

					<select
						value={selected_filters[name] ?? options[0]}
						onchange={e => selected_filters[name] = e.currentTarget.value}
						class="select select-bordered select-sm text-base-content"
					>
						{#each options as option}
							<option value={option}>{option}</option>
						{/each}
					</select>
				</label>
			{/each}
		</form>

		{#if filtered_count > 0 && filtered_count < matches_count}
			<aside transition:fade={FADE_CHARACTERISTICS} class="alert alert-info py-2 text-sm">
				<span>
					Matched
					<span class="font-mono">{filtered_count}</span>
					{filtered_count === 1 ? 'result' : 'results'} (filtered from {matches_count})
				</span>
			</aside>
		{/if}
	</section>
{/if}
