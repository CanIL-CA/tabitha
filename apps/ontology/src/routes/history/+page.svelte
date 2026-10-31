<script lang="ts">
	import type { PageProps } from './$types'
	import Icon from '@iconify/svelte'
	import ChangeDiffData from '#lib/changes/ChangeDiffData.svelte'
	import { format_datetime } from '#lib/format.js'
	import ChangeFilters from '#lib/changes/ChangeFilters.svelte'
	import MoreLink from '#lib/changes/MoreLink.svelte'
	import { APPLIED_CHANGE_FILTERS, filter_changes } from '#lib/changes/change_filters.js'
	import { CHANGES_BATCH_SIZE } from '#lib/changes/changes.js'
	
	let { data }: PageProps = $props()

	let changes = $derived(data.changes)

	// svelte-ignore state_referenced_locally
	let filters = $state({ ...data.filters })
	let filtered_changes = $derived(filter_changes({ changes, ...filters }))

	let visible_count = $state(CHANGES_BATCH_SIZE)
	let visible_changes = $derived(filtered_changes.slice(0, visible_count))

	function reset_visible_count() {
		visible_count = CHANGES_BATCH_SIZE
	}
</script>

<div class="pt-2 w-full">
	<div class="prose">
		<h3>Changes</h3>
	</div>

	<ChangeFilters {changes} bind:filters defaults={APPLIED_CHANGE_FILTERS} onchange={reset_visible_count} />

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
			{#each visible_changes as change}
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

		{#if filtered_changes.length > visible_count}
			<MoreLink remaining={filtered_changes.length - visible_count} onclick={() => visible_count += CHANGES_BATCH_SIZE} />
		{/if}
	{:else}
		No changes to show.
	{/if}
</div>