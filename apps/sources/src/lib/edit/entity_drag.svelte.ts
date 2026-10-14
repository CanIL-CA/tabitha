const DRAG_THRESHOLD_PX = 4
const AUTO_SCROLL_EDGE_PX = 48
const AUTO_SCROLL_MAX_SPEED_PX = 16

type Point = {
	readonly x: number
	readonly y: number
}

type PendingPress = {
	readonly id: number
	readonly element: HTMLElement
	readonly start: Point
}

type EntityDragOptions = {
	readonly on_drop: (drop: { dragged_id: number, slot: number }) => void
}

/**
 * Pointer-driven drag and drop for source entities.
 * Entities mark themselves with `data-entity-index`, drop slots with `data-drop-slot`.
 * Only tracks which entity is dragged and which slot is under the pointer; what range that drags is up to the caller.
 */
export class EntityDrag {
	dragged_id = $state<number | null>(null)
	pointer = $state.raw<Point>({ x: 0, y: 0 })
	pointer_slot = $state<number | null>(null)

	is_dragging = $derived(this.dragged_id !== null)

	ghost_position = $derived<Point | null>(this.is_dragging ? {
		x: this.pointer.x - 5,
		y: this.pointer.y - 5,
	} : null)

	#options: EntityDragOptions
	#press: PendingPress | null = null
	#listeners: AbortController | null = null
	#scroll_container: Element | null = null
	#scroll_frame = 0

	constructor(options: EntityDragOptions) {
		this.#options = options
	}

	press({ event, id }: { event: PointerEvent, id: number }) {
		if (event.button !== 0) return
		if (!(event.currentTarget instanceof HTMLElement)) return
		if (event.target instanceof Element && event.target.closest('.dropdown-content')) return

		this.#press = {
			id,
			element: event.currentTarget,
			start: { x: event.clientX, y: event.clientY },
		}
		this.#listen()
	}

	#listen() {
		this.#listeners?.abort()
		this.#listeners = new AbortController()
		const { signal } = this.#listeners

		window.addEventListener('pointermove', event => this.#move(event), { signal })
		window.addEventListener('pointerup', () => this.#release(), { signal })
		window.addEventListener('pointercancel', () => this.#finish(), { signal })
		window.addEventListener('blur', () => this.#finish(), { signal })
		window.addEventListener('keydown', event => event.key === 'Escape' && this.#finish(), { signal })
	}

	#move(event: PointerEvent) {
		this.pointer = { x: event.clientX, y: event.clientY }
		if (!this.is_dragging && !this.#has_passed_threshold()) return
		if (!this.is_dragging) this.#start()

		this.#update_pointer_slot()
	}

	#has_passed_threshold() {
		if (!this.#press) return false

		const distance = Math.hypot(this.pointer.x - this.#press.start.x, this.pointer.y - this.#press.start.y)
		return distance >= DRAG_THRESHOLD_PX
	}

	#start() {
		if (!this.#press) return

		const { id, element } = this.#press
		this.dragged_id = id
		this.#scroll_container = find_scroll_container(element)
		window.getSelection()?.removeAllRanges()
		this.#scroll_frame = requestAnimationFrame(this.#auto_scroll)
	}

	#update_pointer_slot() {
		this.pointer_slot = this.is_dragging ? find_slot_at_point(this.pointer) : null
	}

	#auto_scroll = () => {
		if (!this.is_dragging || !this.#scroll_container) return

		const { top, bottom } = this.#scroll_container.getBoundingClientRect()
		const speed = get_auto_scroll_speed({ pointer_y: this.pointer.y, top, bottom })
		if (speed !== 0) {
			this.#scroll_container.scrollBy(0, speed)
			this.#update_pointer_slot()
		}
		this.#scroll_frame = requestAnimationFrame(this.#auto_scroll)
	}

	#release() {
		const { dragged_id, pointer_slot } = this
		this.#finish()
		if (dragged_id === null) return

		suppress_next_click()
		if (pointer_slot === null) return

		this.#options.on_drop({ dragged_id, slot: pointer_slot })
	}

	#finish() {
		this.#listeners?.abort()
		this.#listeners = null
		this.#press = null
		this.#scroll_container = null
		cancelAnimationFrame(this.#scroll_frame)
		this.dragged_id = null
		this.pointer_slot = null
	}
}

function find_slot_at_point({ x, y }: Point): number | null {
	const element = document.elementFromPoint(x, y)

	const slot_element = element?.closest<HTMLElement>('[data-drop-slot]')
	if (slot_element) return Number(slot_element.dataset.dropSlot)

	const entity_element = element?.closest<HTMLElement>('[data-entity-index]')
	if (!entity_element) return null

	const { left, width } = entity_element.getBoundingClientRect()

	const index = Number(entity_element.dataset.entityIndex)
	return x < left + width / 2 ? index : index + 1
}

function find_scroll_container(element: HTMLElement): Element | null {
	for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
		const { overflowY } = getComputedStyle(ancestor)
		if (overflowY === 'auto' || overflowY === 'scroll') return ancestor
	}
	return null
}

/** Releasing a drag over the element it started on would otherwise also count as a click on it. */
function suppress_next_click() {
	const swallow_click = (event: MouseEvent) => {
		event.stopPropagation()
		event.preventDefault()
	}
	window.addEventListener('click', swallow_click, { capture: true, once: true })
	setTimeout(() => window.removeEventListener('click', swallow_click, { capture: true }))
}

type AutoScrollOptions = {
	readonly pointer_y: number
	readonly top: number
	readonly bottom: number
}

/** Pixels to scroll this frame: negative near the top edge, positive near the bottom, faster the closer to the edge. */
function get_auto_scroll_speed({ pointer_y, top, bottom }: AutoScrollOptions): number {
	const top_overlap = top + AUTO_SCROLL_EDGE_PX - pointer_y
	const bottom_overlap = pointer_y - (bottom - AUTO_SCROLL_EDGE_PX)
	const speed_for = (overlap: number) => Math.round(AUTO_SCROLL_MAX_SPEED_PX * Math.min(1, overlap / AUTO_SCROLL_EDGE_PX))

	if (top_overlap > 0) return -speed_for(top_overlap)
	if (bottom_overlap > 0) return speed_for(bottom_overlap)
	return 0
}
