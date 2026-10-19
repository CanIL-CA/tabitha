<script lang="ts">
	import type { SourceEntityCategory } from '@tabitha/types'
	import Punctuation from './Punctuation.svelte'

	type Props = {
		source_entity: { category: SourceEntityCategory, value: string }
		size?: 'sm' | 'md' | 'lg'
		classes?: string
	}

	let { source_entity, size = 'md', classes = '' }: Props = $props()

	let value = $derived({ 'Paragraph': '¶', 'Poetry Begin': '(poetry-begin)', 'Poetry End': '(poetry-end)' }[source_entity.value] ?? source_entity.value)
</script>

{#if source_entity.value === 'Paragraph'}
	<Punctuation source_entity={{ ...source_entity, value }} {size} {classes} />
{:else}
	{@const size_class = { sm: 'text-sm', md: 'text-md', lg: 'text-lg' }[size]}
	<span class="font-mono {size_class} {classes}">
		{value}
	</span>
{/if}
