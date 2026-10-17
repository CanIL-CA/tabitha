import { createContext } from 'svelte'
import type { PageSourceEntity } from '#lib/types.js'
import { is_boundary_end } from '#lib/encoding/entity_filters.ts'

/**
 * The entity a page's components treat as selected. Held by id, not object reference, so the
 * selection survives an edit page's undo/redo swapping in a new entities array.
 */
export class SelectedEntity {
	#id = $state<number | null>(null)
	current: PageSourceEntity | null

	constructor(entities: () => PageSourceEntity[]) {
		this.current = $derived(this.#id === null ? null : entities()[this.#id] ?? null)
	}

	select(entity: PageSourceEntity | null) {
		if (!entity) {
			this.#id = null
		} else if (is_boundary_end(entity)) {
			// select the boundary start instead
			this.#id = entity.parent_id
		} else {
			this.#id = entity.id
		}
	}

	clear() {
		this.#id = null
	}
}

export const [get_selected_entity, set_selected_entity] = createContext<SelectedEntity>()
