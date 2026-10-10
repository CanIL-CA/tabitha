<script lang="ts">
	import type { Concept } from '#lib/types.js'

	type Props = {
		concept: Concept
	}

	let { concept }: Props = $props()
</script>

<table class="table ml-8">
	<thead>
		<tr>
			<th>Structure</th>
			<th>Pairing</th>
			<th>Explication</th>
		</tr>
	</thead>
	<tbody>
		{#each concept.how_to_hints as { structure, pairing, explication }}
			<tr>
				<td>{structure || '–'}</td>
				<td>{pairing || '–'}</td>
				<td>{explication || '–'}</td>
			</tr>
		{:else}
			<tr>
				<td colspan="3">No hints available at this time.</td>
			</tr>
		{/each}
	</tbody>
</table>
