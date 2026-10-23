<script lang="ts">
	type Props = {
		source_entity: { value: string }
		size?: 'sm' | 'md' | 'lg'
		classes?: string
	}

	let { source_entity, size = 'md', classes = '' }: Props = $props()

	const size_class = $derived({ sm: 'text-lg', md: '-mt-4 text-6xl', lg: '-mt-4 text-7xl' }[size])
</script>

<span class="inline-flex tracking-widest font-thin {size_class} {classes}">
	{source_entity.value}
</span>
