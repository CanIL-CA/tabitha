<script lang="ts">
	import type { OntologyResult } from '@tabitha/types'
	import type { PageSourceConcept } from '#lib/types.js'
	import type { Snippet } from 'svelte'
	import { PUBLIC_ONTOLOGY_API_HOST } from '$app/env/public'
	import { get_ontology_senses } from '#lib/data/ontology_senses_context.svelte.js'
	import Icon from '@iconify/svelte'

	type Props = {
		data: PageSourceConcept
		actions?: Snippet
	}

	let { data = $bindable(), actions }: Props = $props()

	const ontology_senses = get_ontology_senses()

	let ontology_data = $derived(ontology_senses.sense_of(data))
	let [category, usages] = $derived(get_category_and_usage({ concept: data, current_ontology: ontology_data }))

	function get_ontology_url_for_link({ stem, part_of_speech }: PageSourceConcept) {
		return `${PUBLIC_ONTOLOGY_API_HOST}/?q=${stem}&category=${part_of_speech}`
	}

	function get_category_and_usage({ concept, current_ontology }: { concept: PageSourceConcept, current_ontology: OntologyResult }): [string, string[]] {
		const categories = current_ontology.categories
		if (concept.part_of_speech === 'Noun') {
			return [categories.at(0) ?? '', []]
		} else if (concept.part_of_speech === 'Adjective') {
			return [categories.at(0) ?? '', categories.slice(1)]
		} else {
			return ['', categories]
		}
	}
</script>

<div class="flex w-full mb-2">
	{#if actions}
		{@render actions()}
	{/if}

	<div class="flex justify-end flex-auto">
		<a href={get_ontology_url_for_link(data)} target="_blank" class="link link-accent text-xs flex items-end">
			View in Ontology
			<Icon icon="fe:link-external" class="h-4 w-4" />
		</a>
	</div>
</div>

<table class="table table-sm table-zebra">
	<tbody>
		<tr>
			<th>Concept</th>
			<td>{ontology_data.stem}-{ontology_data.sense}</td>
		</tr>
		<tr>
			<th>Gloss</th>
			<td>{ontology_data.gloss}</td>
		</tr>
		<tr>
			<th>Level</th>
			<td><span class="badge badge-outline L{ontology_data.level} badge-sm font-mono me-1">L{ontology_data.level}</span></td>
		</tr>
		{#if category.length}
			<tr>
				<th>Category</th>
				<td>{category}</td>
			</tr>
		{/if}
		{#if usages.length}
			<tr>
				<th>Usage</th>
				<td>
					<ul>
						{#each usages.filter(cat => !cat.startsWith('never')) as usage}
							<li>{usage}</li>
						{/each}
					</ul>
				</td>
			</tr>
		{/if}
	</tbody>
</table>
