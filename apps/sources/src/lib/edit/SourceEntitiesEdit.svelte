<script lang="ts">
	import Icon from '@iconify/svelte'
	import { fade } from 'svelte/transition'
	import Concept from '#lib/entity_displays/Concept.svelte'
	import BoundaryEnd from '#lib/entity_displays/BoundaryEnd.svelte'
	import BoundaryStart from '#lib/entity_displays/BoundaryStart.svelte'
	import { Punctuation } from '@tabitha/ui'
	import InsertEntityContextMenu from './InsertEntityContextMenu.svelte'
	import { is_boundary_end, is_boundary_start } from '#lib/encoding/entity_filters.js'
	import { structure_entities } from '#lib/encoding/structured.js'
	import { get_clipboard } from './clipboard.svelte'
	import { get_edit_history } from './history.svelte'
	import { get_selected_entity } from '#lib/data/selected_entity.svelte.js'
	import { EntityDrag } from './entity_drag.svelte'
	import {
		get_action_range,
		get_hover_range,
		get_range_length,
		is_entity_in_range,
		is_hover_target_in_range,
		is_slot_in_range,
		type HoverTarget,
		type IndexRange,
	} from '#lib/data/entity_ranges.js'
	import type { PageSourceEntity } from '#lib/types.js'
	import type { EntityContextMenuData } from '#lib/edit/types.js'

	type Props = {
		source_entities: PageSourceEntity[]
	}
	let { source_entities = $bindable() }: Props = $props()

	const edit_history = get_edit_history()
	const selected_entity = get_selected_entity()
	const entity_clipboard = get_clipboard()

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

	const entity_drag = new EntityDrag({ on_drop: drop_entities })

	let drag_range = $derived(
		entity_drag.dragged_id === null ? null
			: get_action_range({ entities: source_entities, id: entity_drag.dragged_id }),
	)

	let select_range = $derived(
		selected_entity.current && get_action_range({ entities: source_entities, id: selected_entity.current.id }),
	)

	let hover_target = $state<HoverTarget | null>(null)

	let hover_range = $derived(
		!hover_target || is_hover_target_in_range({ target: hover_target, range: drag_range }) ? null
			: get_hover_range({ entities: source_entities, target: hover_target }),
	)
	
	//---------------
	// drag and drop

	let drop_slot = $derived(
		entity_drag.pointer_slot === null || is_slot_in_range({ slot: entity_drag.pointer_slot, range: drag_range }) ? null
			: entity_drag.pointer_slot,
	)

	let drag_ghost = $derived.by(() => {
		if (!drag_range) {
			return null
		}
		const entities = source_entities.slice(drag_range[0], drag_range[1] + 1)
		const [start, first, ...rest] = entities
		if (!first) {
			// this is a single entity
			return { shown_entities: [start], hidden_count: 0, closing_entity: undefined }
		}
		// this is a boundary - show one child (if present) and both boundary entities
		return {
			shown_entities: rest.length > 0 ? [start, first] : [start],
			hidden_count: rest.length > 0 ? rest.length - 1 : 0,
			closing_entity: rest.length > 0 ? rest[rest.length - 1] : first,
		}
	})

	//---------------
	// entity popup toolbar 

	let toolbar_entity_id = $state<number | null>(null)
	$effect(() => {
		if (selected_entity.current === null) {
			toolbar_entity_id = null
		}
	})

	//---------------
	// ui class derivation

	type RangeCheck = (arg: { id: number, range: IndexRange | null }) => boolean

	const is_insert_slot_in_range: RangeCheck = ({ id, range }) => is_slot_in_range({ slot: id, range })

	const ENTITY_STATE_BG_CLASSES = {
		hover: 'bg-base-300',
		selected: 'bg-neutral-content',
		dragging: 'bg-neutral-content opacity-40',
		idle: '',
	} as const

	function get_entity_state({ id, range_check }: { id: number, range_check: RangeCheck }): keyof typeof ENTITY_STATE_BG_CLASSES {
		if (range_check({ id, range: drag_range })) return 'dragging'
		if (range_check({ id, range: hover_range })) return 'hover'
		if (range_check({ id, range: select_range })) return 'selected'
		return 'idle'
	}

	const INSERT_BUTTON_STATE_CLASSES = {
		drop_target: 'btn-accent opacity-100 scale-125 shadow-md',
		menu_open: 'btn-primary opacity-100',
		dragging_elsewhere: 'btn-primary opacity-0',
		idle: 'btn-primary opacity-0 focus:opacity-100 hover:opacity-100',
	} as const

	function get_insert_button_state(slot: number): keyof typeof INSERT_BUTTON_STATE_CLASSES {
		if (drop_slot === slot) return 'drop_target'
		if (entity_drag.is_dragging) return 'dragging_elsewhere'
		if (insert_context_menu_data.entity_id === slot) return 'menu_open'
		return 'idle'
	}
	
	//---------------
	// event handlers

	function insert_button_mouseover(slot: number) {
		hover_target = { kind: 'insert_slot', slot }
		toolbar_entity_id = null
	}

	function entity_mouseover(id: number) {
		hover_target = { kind: 'entity', id }

		if (toolbar_entity_id !== id) {
			toolbar_entity_id = null
		}
	}

	function entity_mouseout() {
		hover_target = null
	}

	function entity_focus(i: number) {
		select_entity(i)
		if (selected_entity.current) {
			toolbar_entity_id = selected_entity.current.id
		}
	}

	//---------------
	// actions

	function select_entity(i: number) {
		selected_entity.select(source_entities[i])
	}

	function drop_entities({ dragged_id, slot }: { dragged_id: number, slot: number }) {
		const range = get_action_range({ entities: source_entities, id: dragged_id })

		// a slot on either side of the dragged range is a no-op
		if (!range || slot >= range[0] && slot <= range[1] + 1) return

		const range_length = get_range_length(range)

		// Where the dragged range starts once it has been removed and re-inserted at `slot`.
		const insert_position = slot <= range[0] ? slot : slot - range_length
		edit_history().record()
		const moved_entities = source_entities.splice(range[0], range_length)
		source_entities.splice(insert_position, 0, ...moved_entities)

		structure_entities(source_entities)
		select_entity(insert_position)
	}

	function copy_entity(id: number) {
		const range = get_action_range({ entities: source_entities, id })
		if (!range) return

		entity_clipboard.copy(source_entities.slice(range[0], range[1] + 1))
	}

	function delete_entity(id: number) {
		const range = get_action_range({ entities: source_entities, id })
		if (!range) return

		edit_history().record()
		source_entities.splice(range[0], get_range_length(range))
		structure_entities(source_entities)
		select_entity(range[0] - 1)
	}

	//---------------
	// insert context menu

	let insert_context_menu_data = $state<EntityContextMenuData>({ is_open: false, entity_id: -1, x: 0, y: 0 })

	function open_insert_context_menu({ event, entity_id }: { event: UIEvent, entity_id: number }) {
		event.stopPropagation()
		event.preventDefault()
		insert_context_menu_data = {
			is_open: true,
			entity_id,
			...get_menu_location(event),
		}

		function get_menu_location(event: UIEvent): { x: number, y: number } {
			if (event instanceof MouseEvent) {
				return { x: event.clientX, y: event.clientY }
			}
			const element_rect = (event.target as HTMLElement).getBoundingClientRect()
			return { x: element_rect.left, y: element_rect.bottom }
		}
	}

	function close_insert_context_menu() {
		insert_context_menu_data.is_open = false
		insert_context_menu_data.entity_id = -1
	}

	function close_insert_context_menu_and_recalculate() {
		insert_context_menu_data.is_open = false
		structure_entities(source_entities)
		select_entity(insert_context_menu_data.entity_id)
		insert_context_menu_data.entity_id = -1
	}
</script>

{#snippet insert_button(i: number)}
	<button
		onclick={e => open_insert_context_menu({ event: e, entity_id: i })}
		onkeydown={e => e.key === 'Enter' && open_insert_context_menu({ event: e, entity_id: i })}
		aria-label="Insert Constituent"
		class="btn btn-xs mt-4 h-12 w-4 text-lg {INSERT_BUTTON_STATE_CLASSES[get_insert_button_state(i)]} transition-[opacity,scale] duration-150"
	>
		+
	</button>
{/snippet}

{#snippet entity_component(entity: PageSourceEntity)}
	{@const Component = get_entity_component(entity)}
	<Component source_entity={entity} />
{/snippet}

<div class="inline-flex flex-wrap py-3 {entity_drag.is_dragging ? 'select-none cursor-grabbing **:cursor-grabbing [&_.dropdown-content]:hidden!' : ''}">
	{#each source_entities as entity}
		{@const i = entity.id}

		<div
			role="button"
			tabindex="0"
			data-drop-slot={i}
			onmouseenter={() => insert_button_mouseover(i)}
			onmouseleave={entity_mouseout}
			class="{ENTITY_STATE_BG_CLASSES[get_entity_state({ id: i, range_check: is_insert_slot_in_range })]} z-10"
		>
			{@render insert_button(i)}
		</div>

		<div class="relative">
			<div
				role="button"
				tabindex="0"
				data-entity-index={i}
				onclick={() => entity_focus(i)}
				onkeydown={e => (e.key === 'Enter' || e.key === ' ') && entity_focus(i)}
				onmouseenter={() => entity_mouseover(i)}
				onfocus={() => entity_focus(i)}
				onmouseleave={entity_mouseout}
				onblur={() => {}}
				onpointerdown={event => entity_drag.press({ event, id: i })}
				ondragstart={e => e.preventDefault()}
				class="id-{i} cursor-pointer content-center h-20 {ENTITY_STATE_BG_CLASSES[get_entity_state({ id: i, range_check: is_entity_in_range })]} transition-opacity"
			>
				{@render entity_component(entity)}
			</div>

			{#if toolbar_entity_id === i && !entity_drag.is_dragging}
				{#snippet toolbar_item(action: () => void, icon: string, color: string = '')}
					<li>
						<button onclick={action} class="p-0">
							<Icon {icon} class="h-4.5 w-4.5 m-2 {color}" />
						</button>
					</li>
				{/snippet}
				<ul
					out:fade={{ duration: 150 }}
					class="menu menu-horizontal flex-nowrap shadow-lg inset-shadow-sm bg-base-100 rounded-box p-0 absolute left-[65%] -top-2 z-40"
				>
					{@render toolbar_item(() => copy_entity(i), 'material-symbols:content-copy-outline')}
					{@render toolbar_item(() => delete_entity(i), 'material-symbols:delete-outline-rounded', 'text-error')}
				</ul>
			{/if}
		</div>
	{/each}

	<div data-drop-slot={source_entities.length}>
		{@render insert_button(source_entities.length)}
	</div>

	{#if drag_ghost && entity_drag.ghost_position}
		<div
			aria-hidden="true"
			style:transform="translate({entity_drag.ghost_position.x}px, {entity_drag.ghost_position.y}px)"
			class="fixed top-0 left-0 z-50 pointer-events-none flex items-center h-18 px-2 rounded-box border-2 border-base-content/50 bg-base-100 shadow-xl"
		>
			{#each drag_ghost.shown_entities as ghost_entity (ghost_entity.id)}
				{@render entity_component(ghost_entity)}
			{/each}
			{#if drag_ghost.hidden_count > 0}
				<span class="badge badge-neutral badge-sm ms-1">+{drag_ghost.hidden_count}</span>
			{/if}
			{#if drag_ghost.closing_entity}
				{@render entity_component(drag_ghost.closing_entity)}
			{/if}
		</div>
	{/if}

	{#if insert_context_menu_data.is_open}
		<InsertEntityContextMenu
				bind:source_entities
				data={insert_context_menu_data}
				onclose={close_insert_context_menu}
				onclose_and_recalculate={close_insert_context_menu_and_recalculate} />
	{/if}
</div>
