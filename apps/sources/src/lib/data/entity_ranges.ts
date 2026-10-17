import { is_boundary_end, is_boundary_start } from '#lib/encoding/entity_filters.js'
import type { PageSourceEntity } from '#lib/types.js'

/** Inclusive `[first_id, last_id]` of a run of source entities */
export type IndexRange = readonly [number, number]

/** Insert slot `n` is the insert button just before entity `n` */
export type HoverTarget =
	| { readonly kind: 'entity'; readonly id: number }
	| { readonly kind: 'insert_slot'; readonly slot: number }

type EntityRangeOptions = {
	readonly entities: readonly PageSourceEntity[]
	readonly id: number
}

/** A boundary spans from its start to its end; anything else is acted on by itself. What gets selected, dragged, copied, and deleted. */
export const get_action_range = ({ entities, id }: EntityRangeOptions): IndexRange | null => {
	const entity = entities[id]
	if (!entity) return null
	if (is_boundary_start(entity)) return [id, entities.findLastIndex(child => child.parent_id === id)]
	if (is_boundary_end(entity)) return [entity.parent_id, id]

	return [id, id]
}

/** A boundary marker spans its own boundary; anything else spans the boundary it sits in. */
export const get_enclosing_range = ({ entities, id }: EntityRangeOptions): IndexRange | null => {
	const entity = entities[id]
	if (!entity) return null
	if (is_boundary_start(entity) || is_boundary_end(entity)) return get_action_range({ entities, id })
	if (entity.parent_id < 0) return [id, id]

	return get_action_range({ entities, id: entity.parent_id })
}

/** An insert slot sits inside the boundary of the entity it precedes. */
export const get_insert_slot_range = ({ entities, slot }: { entities: readonly PageSourceEntity[], slot: number }): IndexRange | null => {
	const parent_id = entities[slot]?.parent_id ?? -1
	if (parent_id < 0) return null

	return get_action_range({ entities, id: parent_id })
}

export const get_hover_range = ({ entities, target }: { entities: readonly PageSourceEntity[], target: HoverTarget }): IndexRange | null =>
	target.kind === 'entity'
		? get_enclosing_range({ entities, id: target.id })
		: get_insert_slot_range({ entities, slot: target.slot })

export const is_entity_in_range = ({ id, range }: { id: number, range: IndexRange | null }): boolean =>
	!!range && id >= range[0] && id <= range[1]

/** Only the slots strictly inside a range: the slots on either end sit outside it. */
export const is_slot_in_range = ({ slot, range }: { slot: number, range: IndexRange | null }): boolean =>
	!!range && slot > range[0] && slot <= range[1]

export const is_hover_target_in_range = ({ target, range }: { target: HoverTarget, range: IndexRange | null }): boolean =>
	target.kind === 'entity'
		? is_entity_in_range({ id: target.id, range })
		: is_slot_in_range({ slot: target.slot, range })

export const get_range_length = (range: IndexRange): number => range[1] - range[0] + 1
