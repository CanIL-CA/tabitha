<script lang="ts">
	import { Badge } from '#lib/index.js'
	import type { Snippet } from 'svelte'

	type Props = {
		children: Snippet
		classes?: string
	}

	let { children, classes = '' }: Props = $props()
</script>

<Badge classes="badge-outline px-3 py-5 text-lg tracking-widest {classes}" {children} />
