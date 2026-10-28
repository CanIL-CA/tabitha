<script lang="ts">
	import type { Snippet } from 'svelte'

	type Props = {
		colors?: string
		summary?: Snippet
		children?: Snippet
	}

	let { colors = '', summary, children }: Props = $props()
</script>

<details class="collapse collapse-arrow {colors}">
	<summary class="collapse-title">
		{@render summary?.()}
	</summary>

	<div class="collapse-content">
		{@render children?.()}
	</div>
</details>
