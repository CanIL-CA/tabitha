import { createContext } from 'svelte'
import { is_boundary_end, is_boundary_start } from '#lib/encoding/entity_filters.ts'
import type { PageSourceEntity } from '#lib/types.js'

const is_boundary = (entity: PageSourceEntity): boolean =>
	is_boundary_start(entity) || is_boundary_end(entity)

/**
 * The entities a page's components treat as selected, in the order they were selected. The first
 * is the primary (`current`); the rest only exist when ctrl+clicking built up a multi-selection of
 * non-boundary entities that share a category. Held by id, not object reference, so the selection
 * survives an edit page's undo/redo swapping in a new entities array.
 */
export class SelectedEntity {
	#ids = $state<number[]>([])
	all: PageSourceEntity[]
	current: PageSourceEntity | null
	count: number

	constructor(entities: () => PageSourceEntity[]) {
		this.all = $derived(
			this.#ids.flatMap(id => entities()[id] ?? []),
		)
		this.current = $derived(this.all[0] ?? null)
		this.count = $derived(this.all.length)
	}

	select(entity: PageSourceEntity | null) {
		if (!entity) {
			this.#ids = []
		} else if (is_boundary_end(entity)) {
			// select the boundary start instead
			this.#ids = [entity.parent_id]
		} else {
			this.#ids = [entity.id]
		}
	}

	toggle(entity: PageSourceEntity) {
		const primary = this.current
		if (!primary || is_boundary(entity) || is_boundary(primary)) {
			this.select(entity)
			return
		}
		if (entity.category !== primary.category) return

		this.#ids = this.#ids.includes(entity.id)
			? this.#ids.filter(id => id !== entity.id)
			: [...this.#ids, entity.id]
	}

	is_selected(entity: PageSourceEntity): boolean {
		return this.#ids.includes(entity.id)
	}

	clear() {
		this.#ids = []
	}
}

export const [get_selected_entity, set_selected_entity] = createContext<SelectedEntity>()
