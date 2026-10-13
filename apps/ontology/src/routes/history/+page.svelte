<script lang="ts">
	import type { PageProps } from './$types'
	import Icon from '@iconify/svelte'
	import ChangeDiffData from '#lib/ChangeDiffData.svelte'
	import { check_for_pending_creates } from '#lib/offline/pending.js'
	import { format_datetime } from '#lib/format.js'
	import { concepts_match } from '@tabitha/types/patterns'
	import { change_made_between_versions } from '#lib/changes.js'
	import type { OntologyChangeAction, OntologyChange } from '#lib/types.js'
	import type { ConceptKey, PartOfSpeech } from '@tabitha/types'

	let { data }: PageProps = $props()

	let changes = $derived(data.changes)

	let since = $derived(data.since ?? 'all')
	let before = $derived(data.before ?? 'all')
	let all_versions = $derived(new Set(changes.map(change => change.version).filter(v => v !== 'Failed')))

	let action_type = $state<OntologyChangeAction | 'all'>('all')

	let concept_key = $state<string | null>(null)
	let concept = $derived<ConceptKey | null>(concept_key ? parse_concept_key(concept_key) : null)
	let all_concepts = $derived([...new Set(changes.map(to_concept_key))].toSorted())

	function to_concept_key({ concept: { stem, sense, part_of_speech } }: OntologyChange) {
		return `${stem}|${sense}|${part_of_speech}`
	}
	function parse_concept_key(key: string): ConceptKey {
		const [stem, sense, part_of_speech] = key.split('|')
		return { stem, sense, part_of_speech: part_of_speech as PartOfSpeech }
	}

	let filtered_changes = $derived.by(() => {
		const filters: ((change: OntologyChange) => boolean)[] = [
			change_made_between_versions({ since, before }),
			change => action_type === 'all' || change.action === action_type,
			change => concept === null || concepts_match({ a: change.concept, b: concept }),
		]
		return changes.filter(is_a_match)

		function is_a_match(change: OntologyChange): boolean {
			return filters.every(filter => filter(change))
		}
	})

	$effect(() => {
		// these only live in this browser's offline queue, so the server can't have included them in data.changes
		check_for_pending_creates().then(local => changes = [...local, ...data.changes])
	})
</script>

<div class="pt-5 w-full">
	<div class="prose">
		<h3>Changes</h3>
	</div>

	<section class="flex flex-col py-2">
		<form class="flex gap-4 bg-info text-info-content px-4 pt-2 pb-3.5 overflow-x-auto rounded-box">
			<fieldset class="fieldset">
				<legend class="fieldset-legend text-info-content">Since</legend>

				<select bind:value={since} class="select text-base-content">
					<option value={'all'}>All</option>
					{#each all_versions as version}
						<option value={version}>{version}</option>
					{/each}
				</select>
			</fieldset>

			<fieldset class="fieldset">
				<legend class="fieldset-legend text-info-content">Before</legend>

				<select bind:value={before} class="select text-base-content">
					<option value={'all'}>All</option>
					{#each all_versions as version}
						<option value={version}>{version}</option>
					{/each}
				</select>
			</fieldset>

			<fieldset class="fieldset">
				<legend class="fieldset-legend text-info-content">Action</legend>

				<select bind:value={action_type} class="select text-base-content">
					<option value={'all'}>All</option>
					<option value={'create'}>Add</option>
					<option value={'update'}>Edit</option>
				</select>
			</fieldset>

			<fieldset class="fieldset">
				<legend class="fieldset-legend text-info-content">Concept</legend>

				<select bind:value={concept_key} class="select text-base-content">
					<option value={null}>All</option>
					{#each all_concepts as key}
						{@const { stem, sense, part_of_speech } = parse_concept_key(key)}
						<option value={key}>{stem}-{sense} ({part_of_speech})</option>
					{/each}
				</select>
			</fieldset>
		</form>
	</section>

	{#if filtered_changes.length > 0}
		<table class="table w-full">
			<thead>
				<tr>
					<th>Action</th>
					<th>Concept</th>
					<th>Change</th>
					<th>Status</th>
					<th>Version</th>
				</tr>
			</thead>
			<tbody>
			{#each filtered_changes as change}
				<tr>
					<td class="py-1">{change.action === 'create' ? 'Add' : 'Edit'}</td>
					<td class="py-1">
						<a href={`/?q=${change.concept.stem}&category=${change.concept.part_of_speech}`} target="_blank" class="link link-hover">
							{change.concept.stem}-{change.concept.sense} ({change.concept.part_of_speech})
						</a>
					</td>
					<td class="py-1">
						<ChangeDiffData {change}/>
					</td>
					<td class="py-1">
						{#if change.is_unsynced}
							<span class="badge badge-warning badge-soft gap-1">
								<Icon icon="mdi:cloud-off-outline" class="h-4 w-4" />
								Unsynced
							</span>
						{:else if change.applied_date}
							<div class="flex flex-col gap-0.5">
								<span>Applied</span>
								<span class="text-xs opacity-75 font-mono">{format_datetime({ date: change.applied_date, ...data })}</span>
							</div>
						{:else if change.approved_by}
							<div class="flex flex-col gap-0.5">
								<span>Pending</span>
								<span class="text-xs opacity-75 font-mono">{format_datetime({ date: change.approved_by.date, ...data })}</span>
							</div>
						{:else if change.suggested_by}
							<div class="flex flex-col gap-0.5">
								<span>Suggested</span>
								<span class="text-xs opacity-75 font-mono">{format_datetime({ date: change.suggested_by.date, ...data })}</span>
							</div>
						{/if}
					</td>
					<td class="py-1">
						{change.version || ''}
					</td>
				</tr>
			{/each}
			</tbody>
		</table>
	{:else}
		No changes to show.
	{/if}
</div>