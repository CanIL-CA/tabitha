<script lang="ts">
	import { onMount } from 'svelte'
	import { get_target_data } from '#lib/examples/index.js'
	import type { Reference, TargetTextData } from '@tabitha/types'

	type Props = {
		reference: Reference
	}

	let { reference }: Props = $props()

	let loading = $state(true)
	let target_data = $state<TargetTextData | null>(null)

	onMount(async () => {
		try {
			target_data = await get_target_data(reference) ?? { text: '---', audience: 'none saved yet...' }
		} finally {
			loading = false
		}
	})
</script>

{#if loading}
	<p>
		<span class="loading loading-spinner text-warning"></span>
		getting the target data...
	</p>
{:else if target_data}
	<h4>
		Generated English text ({target_data.audience})
	</h4>
	<p>
		{target_data.text}
	</p>
{/if}
