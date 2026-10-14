const AUTO_SCROLL_EDGE_PX = 48
const AUTO_SCROLL_MAX_SPEED_PX = 16
const GHOST_SHOWN_COUNT = 2
const GHOST_UNCOUNTED_CLOSING_BRACKETS = 1

export type DraggedRange = {
	readonly drag_index: number
	readonly range_length: number
}

export type EntityDrop = DraggedRange & {
	/** Index of the insert button the entities are dropped on, i.e. "insert before this index" */
	readonly slot: number
}

/** Dropping inside the dragged range would leave everything where it is. */
export const is_no_op_slot = ({ slot, drag_index, range_length }: EntityDrop): boolean =>
	slot > drag_index && slot < drag_index + range_length

/** Where the dragged range starts once it has been removed and re-inserted at `slot`. */
export const get_insert_position = ({ slot, drag_index, range_length }: EntityDrop): number =>
	slot <= drag_index ? slot : slot - range_length

type SlotBesideEntityOptions = {
	readonly index: number
	readonly pointer_x: number
	readonly left: number
	readonly width: number
}

export const get_slot_beside_entity = ({ index, pointer_x, left, width }: SlotBesideEntityOptions): number =>
	pointer_x < left + width / 2 ? index : index + 1

type AutoScrollOptions = {
	readonly pointer_y: number
	readonly top: number
	readonly bottom: number
}

/** Pixels to scroll this frame: negative near the top edge, positive near the bottom, faster the closer to the edge. */
export const get_auto_scroll_speed = ({ pointer_y, top, bottom }: AutoScrollOptions): number => {
	const top_overlap = top + AUTO_SCROLL_EDGE_PX - pointer_y
	const bottom_overlap = pointer_y - (bottom - AUTO_SCROLL_EDGE_PX)
	const speed_for = (overlap: number) => Math.round(AUTO_SCROLL_MAX_SPEED_PX * Math.min(1, overlap / AUTO_SCROLL_EDGE_PX))

	if (top_overlap > 0) return -speed_for(top_overlap)
	if (bottom_overlap > 0) return speed_for(bottom_overlap)
	return 0
}

/** The drag ghost shows a boundary's label and first child, with the rest of its contents summarized as a count. */
export const summarize_dragged_range = <T>({ entities }: { entities: readonly T[] }) => ({
	shown_entities: entities.length === 1 ? entities : entities.slice(0, GHOST_SHOWN_COUNT),
	hidden_count: Math.max(0, entities.length - GHOST_SHOWN_COUNT - GHOST_UNCOUNTED_CLOSING_BRACKETS),
	closing_entity: entities.length > GHOST_SHOWN_COUNT ? entities[entities.length - 1] : undefined,
})
