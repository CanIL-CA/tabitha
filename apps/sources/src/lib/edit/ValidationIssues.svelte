<script lang="ts">
	import Icon from '@iconify/svelte'
	import { get_selected_entity } from '#lib/data/selected_entity.svelte.js'
	import type { Validation } from '#lib/edit/validation.svelte.js'
	import type { DescribedIssue } from '#lib/encoding/validation_messages.js'

	type Props = {
		validation: Validation
	}
	let { validation }: Props = $props()

	const selected_entity = get_selected_entity()

	function select_entities(entity_ids: number[]) {
		selected_entity.select_ids({ ids: entity_ids })
		document.querySelector(`[data-entity-index="${entity_ids[0]}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
	}
</script>

{#snippet issue_alert({ message, entity_ids, show_label }: DescribedIssue, alert_class: string)}
	<div role="alert" class="alert alert-soft {alert_class} shadow-lg my-1">
		<div class="flex items-center gap-4">
			<Icon icon="mdi:alert-circle-outline" class="h-5 w-5" />
			<span>{message}</span>
			{#if entity_ids.length}
				<button onclick={() => select_entities(entity_ids)} class="btn btn-xs btn-ghost italic">{show_label}</button>
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
