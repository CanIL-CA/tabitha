import { is_boundary_end, is_boundary_start } from './entity_filters'
import type { PageSourceEntity } from '#lib/types.js'

export function structure_entities(entities: PageSourceEntity[]) {
	const parent_id_stack: number[] = []
	for (const [i, entity] of entities.entries()) {
		entity.id = i
		entity.parent_id = parent_id_stack.at(-1) ?? -1

		if (is_boundary_start(entity)) {
			entity.boundary_category = entity.category_abbr
			parent_id_stack.push(i)

		} else if (is_boundary_end(entity)) {
			entity.boundary_category = entities[entity.parent_id].boundary_category
			parent_id_stack.pop()
		}
	}
}