<script lang="ts">
	import type { PageProps } from './$types'
	import { page } from '$app/state'
	import Icon from '@iconify/svelte'
	import { fade } from 'svelte/transition'
	import ChangeDiffData from '#lib/changes/ChangeDiffData.svelte'
	import ChangeFilters from '#lib/changes/ChangeFilters.svelte'
	import MoreLink from '#lib/changes/MoreLink.svelte'
	import AddConceptButton from '#lib/AddConceptButton.svelte'
	import { NO_CHANGE_FILTERS, filter_changes } from '#lib/changes/change_filters.js'
	import { CHANGES_BATCH_SIZE, apply_pending_changes, approve_change } from '#lib/changes/changes.js'
	import { format_datetime, format_time } from '#lib/format.js'
	import type { OntologyChange } from '#lib/types.js'
	import { onMount } from 'svelte'

	let { data }: PageProps = $props()

	let changes = $derived(data.changes)

	let filters = $state({ ...NO_CHANGE_FILTERS })
	let filtered_changes = $derived(filter_changes({ changes, ...filters }))

	let visible_count = $state(CHANGES_BATCH_SIZE)
	let visible_changes = $derived(filtered_changes.slice(0, visible_count))

	function reset_visible_count() {
		visible_count = CHANGES_BATCH_SIZE
	}

	let save_result = $derived(page.state.save_result)

	$effect(() => {
		if (!save_result) return

		const dismiss_timer = setTimeout(() => {
			save_result = undefined
		}, 5000)

		return () => clearTimeout(dismiss_timer)
	})
	
	let applying_changes = $state(false)
	let status_message = $state('')
	let status_type: 'idle' | 'success' | 'error' = $state('idle')

	let approving_id = $state<number | null>(null)

	async function approve(change: OntologyChange) {
		approving_id = change.id
		status_message = ''

		try {
			const updated = await approve_change(change.id)
			changes = changes.map(c => c.id === change.id ? updated : c)
		} catch (err: unknown) {
			status_message = err instanceof Error ? err.message : 'An error occurred while approving.'
			status_type = 'error'
		} finally {
			approving_id = null
		}
	}

	async function trigger_apply_changes() {
		applying_changes = true
		status_message = 'Applying pending changes...'
		status_type = 'idle'

		try {
			const { count, failed, version, timestamp, changes: updated } = await apply_pending_changes()
			changes = changes.map(c => updated.find(u => u.id === c.id) ?? c)

			const time = format_time({ date: timestamp, ...data })
			const success_message = `Successfully applied ${count} changes at ${time} for new Ontology Version ${version}.`
			const failed_message = failed > 0 ? `Failed to apply ${failed} changes.` : ''
			status_message = `${success_message} ${failed_message}`
			status_type = failed === 0 ? 'success' : 'error'
		} catch (err: unknown) {
			status_message = err instanceof Error ? err.message : 'An error occurred during apply.'
			status_type = 'error'
		} finally {
			applying_changes = false
		}
	}

	let do_highlight = $state(true)
	onMount(() => {
		setTimeout(() => {
			do_highlight = false
		}, 1000)
	})
	let two_mins_ago = $derived.by(() => {
		const two_mins_ago = new Date()
		two_mins_ago.setMinutes(two_mins_ago.getMinutes() - 2)
		return two_mins_ago
	})
	function was_recent_change(change: OntologyChange) {
		return change.applied_date && change.applied_date >= two_mins_ago
			|| change.approved_by && change.approved_by.date >= two_mins_ago
			|| change.suggested_by && change.suggested_by.date >= two_mins_ago
			|| change.is_unsynced
	}
</script>

{#if save_result}
	<div transition:fade class="alert {save_result === 'applied' ? 'alert-success' : 'alert-warning'}">
		{#if save_result === 'applied'}
			Saved — your change is live now.
		{:else if save_result === 'pending'}
			Saved — couldn't apply automatically, so it's pending in the changes queue.
		{:else if save_result === 'queued'}
			Couldn't reach the server — this change is saved on this device and will sync automatically.
		{/if}
	</div>
{/if}

<div class="pt-2 w-full">
	<section class="pb-4">
		<AddConceptButton user={data.user!} />
	</section>

	<div class="prose">
		<h3>Changes</h3>
	</div>

	{#if data.user!.permissions.can_add && changes.some(change => change.approved_by && !change.applied_date)}
		<div class="py-4">
			<button onclick={trigger_apply_changes} disabled={applying_changes} class="btn btn-primary">
				{#if applying_changes}
					<span class="loading loading-spinner loading-xs"></span>
					Applying changes...
				{:else}
					<Icon icon="material-symbols:published-with-changes" class="w-4 h-4" />
					Apply pending changes now
				{/if}
			</button>
		</div>
	{/if}

	{#if status_message}
		<div class="alert mt-4 text-sm {status_type === 'success' ? 'alert-success' : status_type === 'error' ? 'alert-error' : 'alert-info'}">
			{#if status_type === 'success'}
				<Icon icon="material-symbols:check-circle-outline" class="w-5 h-5" />
			{:else if status_type === 'error'}
				<Icon icon="material-symbols:error-outline" class="w-5 h-5" />
			{:else}
				<Icon icon="material-symbols:info-outline" class="w-5 h-5" />
			{/if}
			<span>{status_message}</span>
		</div>
	{/if}

	{#if changes.length > 0}
		<ChangeFilters {changes} bind:filters onchange={reset_visible_count} />
	{/if}

	{#if filtered_changes.length > 0}
		<table class="table w-full">
			<thead>
				<tr>
					<th>Action</th>
					<th>Concept</th>
					<th>Change</th>
					<th>Suggested</th>
					<th>Approved</th>
					<th>Applied</th>
					<th>Version</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
			{#each visible_changes as change}
				<tr class="transition-color duration-3000 {do_highlight && was_recent_change(change) ? 'bg-info/30' : ''}">
					<td>{change.action === 'create' ? 'Add' : 'Edit'}</td>
					<td>
						<div class="flex items-center gap-1">
							<a href={`/?q=${change.concept.stem}&category=${change.concept.part_of_speech}`} target="_blank" class="link link-hover">
								{change.concept.stem}-{change.concept.sense} ({change.concept.part_of_speech})
							</a>
							{#if change.action === 'update' || change.applied_date}
								<a title="Edit concept" href="/protected/concept/update?concept={change.concept.stem}-{change.concept.sense}-{change.concept.part_of_speech}" class="btn btn-xs btn-ghost btn-square">
									<Icon icon="mdi:edit-outline" class="h-4 w-4" />
								</a>
							{/if}
						</div>
					</td>
					<td>
						<ChangeDiffData {change}/>
					</td>
					<td>
						{#if change.suggested_by}
							<div class="flex flex-col gap-0.5">
								<span>{format_datetime({ date: change.suggested_by.date, ...data })}</span>
								<span class="text-xs opacity-75 font-mono">{change.suggested_by.name}</span>
							</div>
						{/if}
					</td>
					<td>
						{#if change.approved_by}
							<div class="flex flex-col gap-0.5">
								<span>{format_datetime({ date: change.approved_by.date, ...data })}</span>
								<span class="text-xs opacity-75 font-mono">{change.approved_by.name}</span>
							</div>
						{:else}
							Awaiting approval
						{/if}
					</td>
					<td>
						{#if change.is_unsynced}
							<span class="badge badge-warning badge-soft gap-1">
								<Icon icon="mdi:cloud-off-outline" class="h-4 w-4" />
								Unsynced
							</span>
						{:else if change.applied_date}
							{format_datetime({ date: change.applied_date, ...data })}
						{:else if change.approved_by}
							Pending
						{/if}
					</td>
					<td>
						{change.version || ''}
					</td>
					<td>
						<div class="flex gap-1">
							{#if change.can_edit && !change.is_unsynced}
								<a href="/protected/concept/{change.action}?change={change.id}" class="btn btn-sm">
									<Icon icon="mdi:edit-outline" class="h-4 w-4" />
									Edit
								</a>
							{/if}
							{#if change.can_approve}
								<button
									onclick={() => approve(change)}
									disabled={!!approving_id}
									class="btn btn-sm btn-primary"
								>
									{#if approving_id === change.id}
										<span class="loading loading-spinner loading-xs"></span>
									{:else}
										Approve
									{/if}
								</button>
							{/if}
						</div>
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