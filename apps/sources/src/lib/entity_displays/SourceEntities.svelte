<script lang="ts">
	import type { PageSourceEntity } from '#lib/types.js'
	import Concept from './Concept.svelte'
	import BoundaryEnd from './BoundaryEnd.svelte'
	import BoundaryStart from './BoundaryStart.svelte'
	import { Punctuation } from '@tabitha/ui'
	import { is_boundary_end, is_boundary_start } from '#lib/encoding/entity_filters.js'

	type IndexRange = [number, number]

	type Props = {
		source_entities: PageSourceEntity[]
		selected_entity: PageSourceEntity|null
		on_entity_select: (entity: PageSourceEntity) => void
	}
	let { source_entities, selected_entity, on_entity_select }: Props = $props()

	let entity_divs: HTMLElement[] = $state([])

	let hover_range: IndexRange | null = $state(null)
	let select_range: IndexRange | null = $derived(
		!selected_entity ? null
			: is_boundary_start(selected_entity)
				? get_boundary_range(selected_entity.id)
				: [selected_entity.id, selected_entity.id],
	)

	let entity_highlights = $derived(source_entities.map((_, i) => {
		if (hover_range && i >= hover_range[0] && i <= hover_range[1]) {
			return 'bg-base-300'
		}
		if (select_range && i >= select_range[0] && i <= select_range[1]) {
			return 'bg-neutral-content'
		}
		return ''
	}))

	const component_filters: [(entity: PageSourceEntity) => boolean, typeof Concept][] = [
		[is_boundary_start, BoundaryStart],
		[is_boundary_end, BoundaryEnd],
		[({ concept }) => !!concept, Concept],
		[() => true, Punctuation],
	]

	function entity_mouseover(i: number) {
		hover_range = get_boundary_range(i)
	}

	function entity_mouseout() {
		hover_range = null
	}

	function entity_focus(i: number) {
		const entity = source_entities[i]
		if (is_boundary_end(entity)) {
			// select the boundary start instead
			on_entity_select(source_entities[entity.parent_id])
		} else {
			on_entity_select(entity)
		}
	}

	function get_boundary_range(i: number): IndexRange {
		const entity = source_entities[i]
		if (is_boundary_start(entity)) {
			const last_id = source_entities.findLastIndex(e => e.parent_id === i)
			return [i, last_id]

		} else if (is_boundary_end(entity)) {
			return [entity.parent_id, entity.id]

		} else if (entity.parent_id >= 0) {
			const last_id = source_entities.findLastIndex(e => e.parent_id === entity.parent_id)
			return [entity.parent_id, last_id]

		} else {
			return [i, i]
		}
	}
</script>

<div class="inline-flex flex-wrap py-3">
	{#each source_entities as entity}
		{@const i = entity.id}
		{@const Component = component_filters.find(([filter]) => filter(entity))?.[1]}
		<div
			bind:this={entity_divs[i]}
			role="button"
			tabindex="0"
			onclick={() => entity_focus(i)}
			onkeydown={e => (e.key === 'Enter' || e.key === ' ') && entity_focus(i)}
			onmouseenter={() => entity_mouseover(i)}
			onfocus={() => entity_focus(i)}
			onmouseleave={entity_mouseout}
			onblur={() => {}}
			class="cursor-pointer content-center px-1 h-20 {entity_highlights[i]}"
		>
			<Component source_entity={entity} />
		</div>
	{/each}
</div>