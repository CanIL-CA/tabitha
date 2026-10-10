<script lang="ts">
	import type { OntologyResult, ConceptKey } from '@tabitha/types'
	import type { Snippet } from 'svelte'
	import { PUBLIC_ONTOLOGY_API_HOST } from '$env/static/public'
	import { fetch_ontology_data_for_all_senses } from '#lib/data/api_lookups.js'
	import Icon from '@iconify/svelte'
	import SidebarDetail from './SidebarDetail.svelte'

	type Props = {
		data: ConceptKey
		title: string
		actions?: Snippet<[OntologyResult]>
	}
	const { data, title, actions }: Props = $props()

	let all_senses = $state<OntologyResult[]>([])

	$effect(() => {
		fetch_ontology_data_for_all_senses(data).then(fetched_senses => {
			all_senses = fetched_senses
		})
	})

	function get_ontology_url_for_link({ stem, part_of_speech }: ConceptKey): string {
		return `${PUBLIC_ONTOLOGY_API_HOST}/?q=${stem}&category=${part_of_speech}`
	}
</script>

{#if all_senses.length > 1}
	<SidebarDetail summary_title={title}>
		{#snippet details_content()}
			<div class="flex justify-end">
				<a href={get_ontology_url_for_link(data)} target="_blank" class="link link-accent text-xs flex items-end">
					Compare in Ontology
					<Icon icon="fe:link-external" class="h-4 w-4" />
				</a>
			</div>

			<table class="table table-sm table-zebra">
				<tbody>
					{#each all_senses as sense_data}
						{@const { stem, sense, level, gloss } = sense_data}
						{@const is_selected = data.sense === sense}
						<tr class="group">
							<td class="{is_selected ? 'font-bold' : ''}">
								{stem}-{sense}
							</td>
							<td>{gloss}</td>
							<td><span class="badge badge-outline L{level} badge-xs font-mono me-1">L{level}</span></td>
							{#if actions}
								<td>{@render actions(sense_data)}</td>
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		{/snippet}
	</SidebarDetail>
{/if}
