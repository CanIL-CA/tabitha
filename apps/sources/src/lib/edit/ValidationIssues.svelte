<script lang="ts">
	import { PUBLIC_ONTOLOGY_API_HOST } from '$app/env/public'
	import Icon from '@iconify/svelte'
	import { get_selected_entity } from '#lib/data/selected_entity.svelte.js'
	import { compact_noun_list_indexes } from '#lib/data/noun_list.js'
	import { get_edit_history } from '#lib/edit/history.svelte.js'
	import type { Validation } from '#lib/edit/validation.svelte.js'
	import { build_curated_example_link } from '#lib/encoding/curated_example_link.js'
	import type { ValidationIssue } from '#lib/encoding/validation.js'
	import type { DescribedIssue } from '#lib/encoding/validation_messages.js'
	import type { Reference } from '@tabitha/types'

	type Props = {
		validation: Validation
		reference: Reference
	}
	let { validation, reference }: Props = $props()

	const selected_entity = get_selected_entity()
	const edit_history = get_edit_history()

	function select_entities(entity_ids: number[]) {
		selected_entity.select_ids({ ids: entity_ids })
		document.querySelector(`[data-entity-index="${entity_ids[0]}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
	}

	// The ontology reads the verse as it is saved, so the link is only offered while nothing has been edited.
	function get_curated_example_link(issue: ValidationIssue): string | undefined {
		if (edit_history().can_undo) return undefined

		return build_curated_example_link({
			issue,
			source_entities: edit_history().current.source_entities,
			reference,
			ontology_host: PUBLIC_ONTOLOGY_API_HOST,
		})
	}

	function compact_noun_list() {
		const { source_entities } = edit_history().current
		edit_history().record({ action: 'noun_index', details: 'compact', ids_before: [] })
		edit_history().current = { source_entities: compact_noun_list_indexes({ source_entities }) }
	}
</script>

{#snippet issue_alert({ message, entity_ids, show_label, issue }: DescribedIssue, alert_class: string)}
	{@const curated_example_link = get_curated_example_link(issue)}
	<div role="alert" class="alert alert-soft {alert_class} shadow-lg my-1">
		<div class="flex items-center gap-4">
			<Icon icon="mdi:alert-circle-outline" class="h-5 w-5" />
			<span>{message}</span>
			{#if entity_ids.length}
				<button onclick={() => select_entities(entity_ids)} class="btn btn-xs btn-ghost italic">{show_label}</button>
			{/if}
			{#if issue.check === 'case_frame' && curated_example_link}
				<a href={curated_example_link} target="_blank" rel="noopener" class="btn btn-xs btn-ghost italic">Add curated example</a>
			{/if}
			{#if issue.check === 'noun_list' && issue.reason === 'unused_index'}
				<button
					type="button"
					onclick={compact_noun_list}
					class="btn btn-xs btn-ghost italic"
				>
					Compact noun list
				</button>
			{/if}
		</div>
	</div>
{/snippet}

<section aria-label="Validation issues" class="relative">
	<button
		type="button"
		onclick={() => validation.hide()}
		aria-label="Close validation issues"
		title="Close"
		class="btn btn-xs btn-circle btn-ghost absolute right-0 top-0"
	>
		<Icon icon="material-symbols:close" class="h-4 w-4" />
	</button>

	{#if !validation.errors.length && !validation.warnings.length}
		<div role="status" class="alert alert-soft alert-success shadow-lg my-1">
			<div class="flex items-center gap-4">
				<Icon icon="mdi:check-circle-outline" class="h-5 w-5" />
				<span>No issues</span>
			</div>
		</div>
	{/if}

	{#each validation.errors as issue, i (i)}
		{@render issue_alert(issue, 'alert-error')}
	{/each}

	{#each validation.warnings as issue, i (i)}
		{@render issue_alert(issue, 'alert-warning')}
	{/each}
</section>
