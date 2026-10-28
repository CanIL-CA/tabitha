<script lang="ts">
	import { AFFECTED_FIELD_LABELS, parse_concept_key, to_concept_key, type ChangeFilterValues } from '#lib/change_filters.js'
	import { parts_of_speech } from '#lib/lookups.js'
	import type { OntologyChange } from '#lib/types.js'

	type Props = {
		changes: OntologyChange[]
		filters: ChangeFilterValues
		onchange: () => void
	}

	let { changes, filters = $bindable(), onchange }: Props = $props()

	let all_versions = $derived(new Set(changes.map(change => change.version).filter(version => version && version !== 'Failed')))
	let all_concepts = $derived([...new Set(changes.map(to_concept_key))].toSorted())
	let changed_parts_of_speech = $derived(parts_of_speech.filter(pos => changes.some(change => change.concept.part_of_speech === pos)))
</script>

<section class="flex flex-col py-2">
	<form {onchange} class="flex gap-4 bg-info text-info-content px-4 pt-2 pb-3.5 flex-wrap rounded-box">
		<fieldset class="fieldset">
			<legend class="fieldset-legend text-info-content">Since</legend>

			<select bind:value={filters.since} class="select text-base-content">
				<option value="all">All</option>
				{#each all_versions as version}
					<option value={version}>{version}</option>
				{/each}
			</select>
		</fieldset>

		<fieldset class="fieldset">
			<legend class="fieldset-legend text-info-content">Before</legend>

			<select bind:value={filters.before} class="select text-base-content">
				<option value="all">All</option>
				{#each all_versions as version}
					<option value={version}>{version}</option>
				{/each}
			</select>
		</fieldset>

		<fieldset class="fieldset">
			<legend class="fieldset-legend text-info-content">Action</legend>

			<select bind:value={filters.action_type} class="select text-base-content">
				<option value="all">All</option>
				<option value="create">Add</option>
				<option value="update">Edit</option>
			</select>
		</fieldset>

		<fieldset class="fieldset">
			<legend class="fieldset-legend text-info-content">Affected field</legend>

			<select bind:value={filters.affected_field} class="select text-base-content">
				<option value="all">All</option>
				{#each Object.entries(AFFECTED_FIELD_LABELS) as [field, label]}
					<option value={field}>{label}</option>
				{/each}
			</select>
		</fieldset>

		<fieldset class="fieldset">
			<legend class="fieldset-legend text-info-content">Part of speech</legend>

			<select bind:value={filters.part_of_speech} class="select text-base-content">
				<option value="all">All</option>
				{#each changed_parts_of_speech as pos}
					<option value={pos}>{pos}</option>
				{/each}
			</select>
		</fieldset>

		<fieldset class="fieldset">
			<legend class="fieldset-legend text-info-content">Concept</legend>

			<select bind:value={filters.concept_key} class="select text-base-content">
				<option value={null}>All</option>
				{#each all_concepts as key}
					{@const { stem, sense, part_of_speech } = parse_concept_key(key)}
					<option value={key}>{stem}-{sense} ({part_of_speech})</option>
				{/each}
			</select>
		</fieldset>
	</form>
</section>
