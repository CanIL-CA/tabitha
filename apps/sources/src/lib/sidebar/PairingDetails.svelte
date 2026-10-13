<script lang="ts">
	import ConceptDetails from '#lib/sidebar/ConceptDetails.svelte'
	import type { SourceEntity } from '@tabitha/types'
	import Icon from '@iconify/svelte'

	let { data }: { data: SourceEntity } = $props()

	let pairing_concept = $derived(data.pairing_concept!)
	let pairing_type = $derived(data.pairing_type!)
</script>

<div class="flex gap-1 mb-2 p-1 items-center font-semibold border border-base-300 rounded-sm">
	{#if pairing_type === 'simple-complex'}
		<Icon icon="mdi:puzzle-outline" class="h-4 w-4" />
		<!-- or mdi:hexagon-multiple-outline -->
		Simple-Complex
	{:else if pairing_type === 'dynamic-literal'}
		<Icon icon="mdi:lightning-bolt-outline" class="h-4 w-4" />
		Dynamic-Literal
	{:else if pairing_type === 'metric-biblical'}
		<Icon icon="mdi:ruler" class="h-4 w-4" />
		Metric-Biblical Units
	{/if}
</div>

<ConceptDetails data={pairing_concept} />
