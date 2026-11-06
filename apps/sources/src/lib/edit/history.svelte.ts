import { createContext } from 'svelte'
import { build_noun_list_rows, type NounListRow } from '#lib/edit/noun_list.js'
import type { PageSourceEntity } from '#lib/types.js'

export type EditState = {
	source_entities: PageSourceEntity[]
}

export type EditAction = 'analyze' | 'insert' | 'delete' | 'move' | 'feature' | 'noun_index' | 'concept' | 'pairing'

const MAX_UNDO_STEPS = 20

/** The state to restore, plus the ids to select once it is restored by undo (`ids_before`) or redo (`ids_after`). */
type HistoryEntry = {
	state: EditState
	ids_before: number[]
	ids_after: number[]
	action: EditAction
	details?: string
}

type RecordOptions = {
	action: EditAction
	ids_before: number[]
	ids_after?: number[]
	details?: string
}

type AppliedAction = Pick<HistoryEntry, 'action' | 'details'> & { ids: number[] }

export class EditHistory {
	current: EditState
	noun_list_rows: NounListRow[]
	#past = $state.raw<HistoryEntry[]>([])
	#future = $state.raw<HistoryEntry[]>([])

	can_undo = $derived(this.#past.length > 0)
	can_redo = $derived(this.#future.length > 0)

	constructor(initial_state: EditState) {
		this.current = $state(initial_state)
		this.noun_list_rows = $derived(build_noun_list_rows({ source_entities: this.current.source_entities }))
	}

	/**
	 * Call immediately *before* mutating `current`, so that undo returns to the pre-edit state.
	 * `ids_before` are the acted-on entity ids in the pre-edit state and `ids_after` are ids in the post-edit
	 * state, which default to `ids_before` for edits that leave the acted-on entities at the same positions.
	 */
	record({ action, details, ids_before, ids_after = ids_before }: RecordOptions) {
		const entry: HistoryEntry = { state: $state.snapshot(this.current), ids_before, ids_after, action, details }
		this.#past = [...this.#past, entry].slice(-MAX_UNDO_STEPS)
		this.#future = []
	}

	/** Returns the ids to select in the restored state. */
	undo(): AppliedAction | undefined {
		const previous = this.#past.at(-1)
		if (!previous) return undefined

		this.#future = [{ ...previous, state: $state.snapshot(this.current) }, ...this.#future]
		this.#past = this.#past.slice(0, -1)
		this.current = previous.state

		const { action, details, ids_before: ids } = previous
		return { action, details, ids }
	}

	/** Returns the ids to select in the restored state. */
	redo(): AppliedAction | undefined {
		const next = this.#future.at(0)
		if (!next) return undefined

		this.#past = [...this.#past, { ...next, state: $state.snapshot(this.current) }]
		this.#future = this.#future.slice(1)
		this.current = next.state
		
		const { action, details, ids_after: ids } = next
		return { action, details, ids }
	}
}

export const [get_edit_history, set_edit_history] = createContext<() => EditHistory>()
