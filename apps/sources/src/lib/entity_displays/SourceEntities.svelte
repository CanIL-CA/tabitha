<script lang="ts">
	import type { PageSourceEntity } from '#lib/types.js'
	import Concept from './Concept.svelte'
	import BoundaryEnd from './BoundaryEnd.svelte'
	import BoundaryStart from './BoundaryStart.svelte'
	import { Punctuation } from '@tabitha/ui'
	import { is_boundary_end, is_boundary_start } from '#lib/encoding/entity_filters.js'
	import { get_selected_entity } from '#lib/data/selected_entity.svelte.js'
	import { get_action_range, get_hover_range, is_entity_in_range, type HoverTarget } from '#lib/edit/entity_ranges.js'

	type Props = {
		source_entities: PageSourceEntity[]
	}
	let { source_entities }: Props = $props()

	const component_filters: [(entity: PageSourceEntity) => boolean, typeof Concept][] = [
		[is_boundary_start, BoundaryStart],
		[is_boundary_end, BoundaryEnd],
		[({ concept }) => !!concept, Concept],
		[() => true, Punctuation],
	]

	function get_entity_component(entity: PageSourceEntity) {
		return component_filters.find(([filter]) => filter(entity))?.[1] ?? Punctuation
	}

	//---------------
	// entity interactive state and ranges

	const selected_entity = get_selected_entity()

	let select_range = $derived(
		selected_entity.current && get_action_range({ entities: source_entities, id: selected_entity.current.id }),
	)

	let hover_target = $state<HoverTarget | null>(null)

	let hover_range = $derived(!hover_target ? null : get_hover_range({ entities: source_entities, target: hover_target }))
	
	const ENTITY_STATE_BG_CLASSES = {
		hover: 'bg-base-300',
		selected: 'bg-neutral-content',
		idle: '',
	} as const

	function get_entity_state({ id }: { id: number }): keyof typeof ENTITY_STATE_BG_CLASSES {
		if (is_entity_in_range({ id, range: hover_range })) return 'hover'
		if (is_entity_in_range({ id, range: select_range })) return 'selected'
		return 'idle'
	}

	//---------------
	// event handlers

	function entity_mouseover(id: number) {
		hover_target = { kind: 'entity', id }
	}

	function entity_mouseout() {
		hover_target = null
	}

	function entity_focus(i: number) {
		selected_entity.select(source_entities[i])
	}
</script>

<div class="inline-flex flex-wrap py-3">
	{#each source_entities as entity}
		{@const i = entity.id}
		{@const Component = get_entity_component(entity)}
		<div
			role="button"
			tabindex="0"
			onclick={() => entity_focus(i)}
			onkeydown={e => (e.key === 'Enter' || e.key === ' ') && entity_focus(i)}
			onmouseenter={() => entity_mouseover(i)}
			onfocus={() => entity_focus(i)}
			onmouseleave={entity_mouseout}
			onblur={() => {}}
			class="cursor-pointer content-center px-1 h-20 {ENTITY_STATE_BG_CLASSES[get_entity_state({ id: i })]}"
		>
			<Component source_entity={entity} />
		</div>
	{/each}
</div>