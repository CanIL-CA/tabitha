<script lang="ts">
	import type { PageSourceEntity } from '#lib/types.js'
	import { Punctuation } from '@tabitha/ui'

	let { source_entity }: { source_entity: PageSourceEntity } = $props()

	let bracket_entity = $derived({ ...source_entity, value: ']' })
</script>

<div class="inline-flex entity-{source_entity.boundary_category}">
	<Punctuation source_entity={bracket_entity} size={source_entity.value === '}' ? 'lg' : 'md'} />
</div>
