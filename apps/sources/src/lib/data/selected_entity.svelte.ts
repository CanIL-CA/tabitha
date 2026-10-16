import { createContext } from 'svelte'
import type { PageSourceEntity } from '#lib/types.js'

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
		this.#id = entity?.id ?? null
	}

	clear() {
		this.#id = null
	}
}

export const [get_selected_entity, set_selected_entity] = createContext<SelectedEntity>()
