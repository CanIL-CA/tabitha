<script lang="ts">
	import Icon from '@iconify/svelte'
	import type { PageProps } from './$types'
	import { format_datetime } from '$lib/format'

	let { data }: PageProps = $props()

	function change_log_url(backup_index: number) {
		// backups may skip several versions based on how many changes were made between backups.
		// the backups are in descending order, so the previous backup is index + 1
		const backup_version = data.backups[backup_index].version
		const previous_backup_version = backup_index === data.backups.length - 1 ? 'all' : data.backups[backup_index + 1].version
		const params = new URLSearchParams({ since: previous_backup_version, before: backup_version })
		return `/history?${params.toString()}`
	}
</script>

{#if data.pending}
	<div class="alert alert-info">
		A new Ontology version will be available soon. Check back tomorrow to get these latest updates.
	</div>
{/if}

<table class="table">
	<thead>
		<tr>
			<th>Database</th>
			<th>Version</th>
			<th>Created</th>
			<th>Size</th>
			<th></th>
		</tr>
	</thead>

	<tbody>
		{#each data.backups as { version, created_at, size_mb, url }, i}
			<tr class="hover">
				<td>Ontology</td>
				<td>
					<div class="flex gap-3">
						{version}
						<a href={change_log_url(i)} target="_blank" class="link link-accent link-hover text-sm flex items-end">
							view changelog
							<Icon icon="fe:link-external" class="h-6 w-6" />
						</a>
					</div>
				</td>
				<td>{format_datetime({ date: created_at, ...data })}</td>
				<td>{size_mb} MB</td>
				<td>
					<!-- download name being controlled by https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Disposition since the download link is cross-origin -->
					<a href={url} download class="btn btn-sm btn-secondary">
						<Icon icon="material-symbols:download-rounded" class="h-5 w-5"/>
					</a>
				</td>
			</tr>
		{:else}
			<tr><td colspan="5">No backups available.</td></tr>
		{/each}
	</tbody>
</table>