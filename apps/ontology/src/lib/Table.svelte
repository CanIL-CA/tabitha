<script lang="ts">
	import type { Concept } from '#lib/types.js'
	import { DetailedCard, Level, Meaning, Occurrences } from '#lib/index.js'
	import PendingChange from '#lib/PendingChange.svelte'

	type Props = {
		concepts: Concept[]
	}

	let { concepts }: Props = $props()

	let selected_concept = $state<Concept | null>(null)

	function open(concept: Concept) {
		selected_concept = concept
	}

	function close() {
		selected_concept = null
	}
</script>

<table class="table table-xs sm:table-sm md:table-md lg:table-lg">
	<thead class="border-b-4">
		<tr>
			<th>Stem</th>
			<th>Sense</th>
			<th>Part of speech</th>
			<th>Gloss</th>
			<th>Level</th>
			<th>Occurrences</th>
		</tr>
	</thead>

	<tbody>
		{#each concepts as concept (`${concept.stem}-${concept.sense}-${concept.part_of_speech}`)}
			{@const pending_level_change = concept.pending_changes.find(change => change.data.level)}
			<tr onclick={() => open(concept)} class="hover cursor-pointer">
				<td>
					{concept.stem}
				</td>
				<td>
					{concept.sense}
				</td>
				<td>
					{concept.part_of_speech}
				</td>
				<td>
					<Meaning {concept} compact />
				</td>
				<td>
					<Level level={concept.level} />
					{#if pending_level_change}
						<PendingChange change={pending_level_change}>
							<Level level={pending_level_change.data.level?.value || ''} />
						</PendingChange>
					{/if}
				</td>
				<td class="text-center">
					<Occurrences {concept} />
				</td>
			</tr>
		{/each}
	</tbody>
</table>

{#if selected_concept}
	<DetailedCard concept={selected_concept} onclose={close} />
{/if}
