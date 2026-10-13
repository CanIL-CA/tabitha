<script lang="ts">
	import type { OntologyResult } from '@tabitha/types'
	import type { PageSourceConcept } from '#lib/types.js'
	import type { Snippet } from 'svelte'
	import { PUBLIC_ONTOLOGY_API_HOST } from '$env/static/public'
	import { fetch_concept_ontology_data } from '#lib/data/api_lookups.js'
	import Icon from '@iconify/svelte'

	type Props = {
		data: PageSourceConcept
		actions?: Snippet
	}

	let { data = $bindable(), actions }: Props = $props()

	let ontology_data = $state<OntologyResult | null>(null)

	$effect(() => {
		let canceled = false
		ontology_data = data.ontology_data ?? null

		if (!data.ontology_data) {
			fetch_concept_ontology_data(data).then(res => {
				if (!canceled) {
					ontology_data = res
				}
			})
		}

		return () => {
			canceled = true
		}
	})

	function get_ontology_url_for_link({ stem, part_of_speech }: PageSourceConcept) {
		return `${PUBLIC_ONTOLOGY_API_HOST}/?q=${stem}&category=${part_of_speech}`
	}

	function get_category_and_usage({ concept, current_ontology }: { concept: PageSourceConcept, current_ontology: OntologyResult | null }): [string, string[]] {
		const categories = current_ontology?.categories || []
		if (concept.part_of_speech === 'Noun') {
			return [categories.at(0) ?? '', []]
		} else if (concept.part_of_speech === 'Adjective') {
			return [categories.at(0) ?? '', categories.slice(1)]
		} else {
			return ['', categories]
		}
	}
</script>

{#if ontology_data}
	{@const { stem, sense, level, gloss } = ontology_data}
	{@const [category, usages] = get_category_and_usage({ concept: data, current_ontology: ontology_data })}

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
				<td>{stem}-{sense}</td>
			</tr>
			<tr>
				<th>Gloss</th>
				<td>{gloss}</td>
			</tr>
			<tr>
				<th>Level</th>
				<td><span class="badge badge-outline L{level} badge-sm font-mono me-1">L{level}</span></td>
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
{:else}
	<span>Loading Ontology data...</span>
{/if}
