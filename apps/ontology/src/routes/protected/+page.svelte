<script lang="ts">
	import Icon from '@iconify/svelte'
	import { format_time } from '$lib/format'
	import { sync_complex_terms } from '$lib/sync'

	let { data } = $props()

	let syncing = $state(false)
	let status_message = $state('')
	let status_type: 'idle' | 'success' | 'error' = $state('idle')

	async function trigger_sync() {
		syncing = true
		status_message = 'Fetching and syncing complex terms spreadsheet...'
		status_type = 'idle'

		try {
			const { count, timestamp } = await sync_complex_terms()
			const time = format_time({ date: timestamp, ...data })
			status_message = `Successfully synced ${count} complex terms at ${time}.`
			status_type = 'success'
		} catch (err: unknown) {
			status_message = err instanceof Error ? err.message : 'An error occurred during sync.'
			status_type = 'error'
		} finally {
			syncing = false
		}
	}
</script>

<div class="space-y-6">
	<section>
		<h1 class="text-2xl font-bold mb-2">Ontology Management</h1>
		<p class="text-base-content/70">Manage ontology concepts and data synchronization.</p>
	</section>

	<div class="grid gap-4 md:grid-cols-2">
		<div class="card bg-base-200 shadow-sm border border-base-300 p-5">
			<h2 class="text-lg font-semibold mb-2 flex items-center gap-2">
				<Icon icon="material-symbols:sync" class="w-5 h-5 text-primary" />
				Complex Terms Synchronization
			</h2>
			<p class="text-sm text-base-content/70 mb-4">
				Sync simplification hints and complex terms from the latest Google Sheet document into D1.
			</p>
			<div>
				<button onclick={trigger_sync} disabled={syncing} class="btn btn-primary">
					{#if syncing}
						<span class="loading loading-spinner loading-xs"></span>
						Syncing...
					{:else}
						<Icon icon="material-symbols:sync" class="w-4 h-4" />
						Sync Complex Terms Now
					{/if}
				</button>
			</div>

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
		</div>

		<div class="card bg-base-200 shadow-sm border border-base-300 p-5">
			<h2 class="text-lg font-semibold mb-2 flex items-center gap-2">
				<Icon icon="material-symbols:add" class="w-5 h-5 text-accent" />
				Concepts
			</h2>
			<p class="text-sm text-base-content/70 mb-4">
				Create and manage ontology concepts.
			</p>
			<div>
				<a href="/protected/concept/create" class="btn btn-accent">
					<Icon icon="material-symbols:add" class="w-4 h-4" />
					Add Concept
				</a>
			</div>
		</div>

		<div class="card bg-base-200 shadow-sm border border-base-300 p-5">
			<h2 class="text-lg font-semibold mb-2 flex items-center gap-2">
				<Icon icon="material-symbols:published-with-changes" class="w-5 h-5 text-primary" />
				Changes
			</h2>
			<p class="text-sm text-base-content/70 mb-4">
				{#if data.user?.permissions.can_add}
					View and approve pending changes to the Ontology. Approving changes will make them available in a new downloadable Ontology Version.
				{:else}
					View previous and pending changes to the Ontology.
				{/if}
			</p>
			<div>
				<a href="/protected/changes?status=pending" title="Pending Changes" class="btn btn-primary">
					<Icon icon="material-symbols:published-with-changes" class="w-5 h-5" />
					View Pending Changes
				</a>
				<a href="/protected/changes" title="All Changes" class="btn btn-secondary">
					<Icon icon="material-symbols:published-with-changes" class="w-5 h-5" />
					View All Changes
				</a>
			</div>
		</div>
	</div>
</div>