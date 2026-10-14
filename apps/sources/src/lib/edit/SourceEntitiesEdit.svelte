<script lang="ts">
	import Icon from '@iconify/svelte'
	import { fade } from 'svelte/transition'
	import Concept from '../entity_displays/Concept.svelte'
	import BoundaryEnd from '../entity_displays/BoundaryEnd.svelte'
	import BoundaryStart from '../entity_displays/BoundaryStart.svelte'
	import { Punctuation } from '@tabitha/ui'
	import InsertEntityContextMenu from './InsertEntityContextMenu.svelte'
	import { is_boundary_end, is_boundary_start } from '#lib/encoding/entity_filters.js'
	import { structure_entities } from '#lib/encoding/structured.js'
	import { entity_clipboard } from './clipboard.svelte'
	import { get_edit_history } from './history.svelte'
	import { EntityDrag } from './entity_drag.svelte'
	import { get_insert_position, summarize_dragged_range, type EntityDrop } from './drag_positions'
	import type { PageSourceEntity } from '#lib/types.js'
	import type { EntityContextMenuData } from '#lib/edit/types.js'

	type IndexRange = [number, number]

	type Props = {
		source_entities: PageSourceEntity[]
		selected_entity: PageSourceEntity | null
		on_entity_select: (entity: PageSourceEntity | null) => void
	}
	let { source_entities = $bindable(), selected_entity, on_entity_select }: Props = $props()

	const edit_history = get_edit_history()

	let hover_range = $state<IndexRange | null>(null)
	let select_range = $derived<IndexRange | null>(
		!selected_entity ? null
			: is_boundary_start(selected_entity)
				? get_boundary_range(selected_entity.id)
				: [selected_entity.id, selected_entity.id],
	)

	const ENTITY_STATE_CLASSES = {
		hover: 'bg-base-300',
		selected: 'bg-neutral-content',
		dragging: 'bg-neutral-content opacity-40',
		idle: '',
	} as const

	function get_entity_state({ i, range_check }: { i: number, range_check: (arg: { i: number, range: IndexRange | null }) => boolean }): keyof typeof ENTITY_STATE_CLASSES {
		if (range_check({ i, range: drag_range })) return 'dragging'
		if (range_check({ i, range: hover_range })) return 'hover'
		if (range_check({ i, range: select_range })) return 'selected'
		return 'idle'
	}

	const component_filters: [(entity: PageSourceEntity) => boolean, typeof Concept][] = [
		[is_boundary_start, BoundaryStart],
		[is_boundary_end, BoundaryEnd],
		[({ concept }) => !!concept, Concept],
		[() => true, Punctuation],
	]

	function get_entity_component(entity: PageSourceEntity) {
		return component_filters.find(([filter]) => filter(entity))?.[1] ?? Punctuation
	}

	let toolbar_entity_id = $state<number | null>(null)
	$effect(() => {
		if (selected_entity === null) {
			toolbar_entity_id = null
		}
	})

	let insert_context_menu_data = $state<EntityContextMenuData>({
		is_open: false,
		entity_id: -1,
		x: 0,
		y: 0,
	})

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

	function insert_button_mouseover(i: number) {
		if (entity_in_range({ i, range: drag_range })) return

		// look at the parent of the entity in the insert slot, because the insert button is like a single entity within that parent
		const parent_id = source_entities[i].parent_id
		hover_range = parent_id === -1 ? null : get_boundary_range(parent_id)
		toolbar_entity_id = null
	}

	function entity_mouseover(i: number) {
		if (entity_in_range({ i, range: drag_range })) return

		hover_range = get_boundary_range(i)

		if (toolbar_entity_id !== i) {
			toolbar_entity_id = null
		}
	}

	function entity_mouseout() {
		hover_range = null
	}

	function entity_focus(i: number) {
		select_entity(i)
		if (selected_entity) {
			toolbar_entity_id = selected_entity.id
		}
	}

	function select_entity(i: number) {
		const entity = source_entities[i]
		if (!entity) {
			on_entity_select(null)
		} else if (is_boundary_end(entity)) {
			// select the boundary start instead
			on_entity_select(source_entities[entity.parent_id])
		} else {
			on_entity_select(entity)
		}

		toolbar_entity_id = null
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

	function on_entity_drag({ e, i }: { e: PointerEvent, i: number }) {
		const drag_index = is_boundary_end(source_entities[i]) ? source_entities[i].parent_id : i
		entity_drag.press({ event: e, index: drag_index })
	}

	const entity_drag = new EntityDrag({
		get_range_length: get_action_range_length,
		on_drop: move_entities,
	})

	let drag_range = $derived<IndexRange | null>(entity_drag.active && [
		entity_drag.active.drag_index,
		entity_drag.active.drag_index + entity_drag.active.range_length - 1,
	])

	let drag_ghost = $derived(entity_drag.active && summarize_dragged_range({
		entities: source_entities.slice(entity_drag.active.drag_index, entity_drag.active.drag_index + entity_drag.active.range_length),
	}))

	function entity_in_range({ i, range }: { i: number, range: IndexRange | null }) {
		return !!range && i >= range[0] && i <= range[1]
	}

	function insert_button_in_range({ i, range }: { i: number, range: IndexRange | null }) {
		return !!range && i > range[0] && i <= range[1]
	}

	const INSERT_BUTTON_STATE_CLASSES = {
		drop_target: 'btn-accent opacity-100 scale-125 shadow-md',
		menu_open: 'btn-primary opacity-100',
		dragging_elsewhere: 'btn-primary opacity-0',
		idle: 'btn-primary opacity-0 focus:opacity-100 hover:opacity-100',
	} as const

	function get_insert_button_state(i: number): keyof typeof INSERT_BUTTON_STATE_CLASSES {
		if (entity_drag.drop_slot === i) return 'drop_target'
		if (entity_drag.active) return 'dragging_elsewhere'
		if (insert_context_menu_data.entity_id === i) return 'menu_open'
		return 'idle'
	}

	// actions

	function move_entities({ drag_index, range_length, slot }: EntityDrop) {
		const insert_position = get_insert_position({ drag_index, range_length, slot })
		edit_history().record()
		const moved_entities = source_entities.splice(drag_index, range_length)
		source_entities.splice(insert_position, 0, ...moved_entities)

		structure_entities(source_entities)
		select_entity(insert_position)
	}

	function copy_entity(i: number) {
		const entity_range = source_entities.slice(i, i + get_action_range_length(i))
		entity_clipboard.copy(entity_range)
	}

	function delete_entity(i: number) {
		edit_history().record()
		source_entities.splice(i, get_action_range_length(i))
		structure_entities(source_entities)
		select_entity(i - 1)
	}

	function get_action_range_length(i: number) {
		if (is_boundary_start(source_entities[i])) {
			const last_child_index = source_entities.findLastIndex(entity => entity.parent_id === i)
			return last_child_index - i + 1
		} else {
			return 1
		}
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

<div class="inline-flex flex-wrap py-3 {entity_drag.active ? 'select-none cursor-grabbing **:cursor-grabbing [&_.dropdown-content]:hidden!' : ''}">
	{#each source_entities as entity}
		{@const i = entity.id}

		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			data-drop-slot={i}
			onmouseenter={() => insert_button_mouseover(i)}
			class="{ENTITY_STATE_CLASSES[get_entity_state({ i, range_check: insert_button_in_range })]} z-10"
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
				onpointerdown={e => on_entity_drag({ e, i })}
				ondragstart={e => e.preventDefault()}
				class="id-{i} cursor-pointer content-center h-20 {ENTITY_STATE_CLASSES[get_entity_state({ i, range_check: entity_in_range })]} transition-opacity"
			>
				{@render entity_component(entity)}
			</div>

			{#if toolbar_entity_id === i && !entity_drag.active}
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