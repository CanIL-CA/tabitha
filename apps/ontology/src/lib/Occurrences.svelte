<script lang="ts">
	import { CONCEPT_FILTERS } from './filters'
	import type { Concept } from '#lib/types.js'

	type Props = {
		concept: Concept
	}

	let { concept }: Props = $props()

	let occurrences = $derived(concept.occurrences)
</script>

{#if CONCEPT_FILTERS.IS_OR_WILL_BE_IN_ONTOLOGY(concept)}
	<span class="badge badge-success badge-md tooltip tooltip-left font-mono" data-tip="Occurrences">
		{occurrences}
	</span>
{/if}
