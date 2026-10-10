<script lang="ts">
	import { Level, Occurrences, ConceptKey } from '#lib/index.js'
	import PendingChange from '#lib/PendingChange.svelte'
	import type { Concept } from '#lib/types.js'

	let { concept }: { concept: Concept } = $props()

	let pending_change = $derived(concept.pending_changes.find(change => change.data.level))
</script>

<div class="prose max-w-none">
	<ConceptKey {concept} />
</div>

<aside class="flex flex-col items-center gap-1 self-start">
	<div class="flex flex-row items-center gap-1">
		<Level level={concept.level} />
		{#if pending_change}
			<PendingChange change={pending_change}>
				<Level level={pending_change.data.level!.value} />
			</PendingChange>
		{/if}
	</div>

	<Occurrences {concept} />
</aside>
