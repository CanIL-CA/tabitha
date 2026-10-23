<script lang="ts">
	import Icon from '@iconify/svelte'
	import type { Snippet } from 'svelte'

	type Props = {
		content: string
		classes?: string
		children?: Snippet
	}

	let { content, classes = '', children }: Props = $props()

	let copied = $state('')
	async function copy() {
		// https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText
		await navigator.clipboard.writeText(content)

		copied = content
	}
</script>

<button type="button" onclick={copy} class="btn btn-secondary {classes}">
	{#if children}
		{@render children()}
	{:else}
		Copy to clipboard
	{/if}

	<Icon icon={ content !== '' && copied === content ? 'mdi:check' : 'mdi:content-copy' } class="h-6 w-6" />
</button>
