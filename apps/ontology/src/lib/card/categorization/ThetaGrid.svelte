<script lang="ts">
	type Props = {
		categories: string[]
	}

	let { categories }: Props = $props()
</script>

<div class="flex flex-wrap gap-0 overflow-x-auto font-mono text-sm">
	{#each categories as category}
		<span class="whitespace-nowrap border-4 border-double p-2">
			{category}
		</span>
	{:else}
		<span class="whitespace-nowrap border-4 border-double p-2 opacity-60">
			No theta grid information available.
		</span>
	{/each}
</div>
