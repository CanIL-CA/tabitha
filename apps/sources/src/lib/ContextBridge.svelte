<script lang="ts">
	import { setContext, type Snippet } from 'svelte'

	type Props = {
		contexts: Map<unknown, unknown>
		children: Snippet
	}
	let { contexts, children }: Props = $props()

	// A snippet rendered by the layout resolves context from the layout, not from the page that
	// declared it, so the page hands its own contexts across here.
	// svelte-ignore state_referenced_locally
	for (const [key, value] of contexts) setContext(key, value)
</script>

{@render children()}
