import { createContext } from 'svelte'
import type { NounListEntry } from '@tabitha/types'
import type { PageSourceEntity } from '#lib/types.js'

export type EditState = {
	source_entities: PageSourceEntity[]
	noun_list: NounListEntry[]
}

const MAX_UNDO_STEPS = 20

export class EditHistory {
	current: EditState
	#past = $state.raw<EditState[]>([])
	#future = $state.raw<EditState[]>([])

	can_undo = $derived(this.#past.length > 0)
	can_redo = $derived(this.#future.length > 0)

	constructor(initial_state: EditState) {
		this.current = $state(initial_state)
	}

	/** Call immediately *before* mutating `current`, so that undo returns to the pre-edit state. */
	record() {
		this.#past = [...this.#past, $state.snapshot(this.current)].slice(-MAX_UNDO_STEPS)
		this.#future = []
	}

	undo() {
		const previous_state = this.#past.at(-1)
		if (!previous_state) return

		this.#future = [$state.snapshot(this.current), ...this.#future]
		this.#past = this.#past.slice(0, -1)
		this.current = previous_state
	}

	redo() {
		const next_state = this.#future.at(0)
		if (!next_state) return

		this.#past = [...this.#past, $state.snapshot(this.current)]
		this.#future = this.#future.slice(1)
		this.current = next_state
	}
}

export const [get_edit_history, set_edit_history] = createContext<() => EditHistory>()
