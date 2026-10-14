import { get_auto_scroll_speed, get_slot_beside_entity, is_no_op_slot, type DraggedRange, type EntityDrop } from './drag_positions'

const DRAG_THRESHOLD_PX = 4

type Point = {
	readonly x: number
	readonly y: number
}

type PendingPress = {
	readonly index: number
	readonly element: HTMLElement
	readonly start: Point
}

type ActiveDrag = DraggedRange

type EntityDragOptions = {
	readonly get_range_length: (index: number) => number
	readonly on_drop: (drop: EntityDrop) => void
}

/**
 * Pointer-driven drag and drop for source entities.
 * Entities mark themselves with `data-entity-index`, drop slots with `data-drop-slot`.
 */
export class EntityDrag {
	active = $state.raw<ActiveDrag | null>(null)
	pointer = $state.raw<Point>({ x: 0, y: 0 })
	drop_slot = $state<number | null>(null)

	ghost_position = $derived<Point | null>(this.active && {
		x: this.pointer.x - 5,
		y: this.pointer.y - 5,
	})

	#options: EntityDragOptions
	#press: PendingPress | null = null
	#listeners: AbortController | null = null
	#scroll_container: Element | null = null
	#scroll_frame = 0

	constructor(options: EntityDragOptions) {
		this.#options = options
	}

	press({ event, index }: { event: PointerEvent, index: number }) {
		if (event.button !== 0) return
		if (!(event.currentTarget instanceof HTMLElement)) return
		if (event.target instanceof Element && event.target.closest('.dropdown-content')) return

		this.#press = {
			index,
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
		if (!this.active && !this.#has_passed_threshold()) return
		if (!this.active) this.#start()

		this.#update_drop_slot()
	}

	#has_passed_threshold() {
		if (!this.#press) return false

		const distance = Math.hypot(this.pointer.x - this.#press.start.x, this.pointer.y - this.#press.start.y)
		return distance >= DRAG_THRESHOLD_PX
	}

	#start() {
		if (!this.#press) return

		const { index, element } = this.#press
		this.active = {
			drag_index: index,
			range_length: this.#options.get_range_length(index),
		}
		this.#scroll_container = find_scroll_container(element)
		window.getSelection()?.removeAllRanges()
		this.#scroll_frame = requestAnimationFrame(this.#auto_scroll)
	}

	#update_drop_slot() {
		const slot = find_slot_at_point(this.pointer)
		if (slot === null || !this.active) {
			this.drop_slot = null
			return
		}

		const { drag_index, range_length } = this.active
		this.drop_slot = is_no_op_slot({ slot, drag_index, range_length }) ? null : slot
	}

	#auto_scroll = () => {
		if (!this.active || !this.#scroll_container) return

		const { top, bottom } = this.#scroll_container.getBoundingClientRect()
		const speed = get_auto_scroll_speed({ pointer_y: this.pointer.y, top, bottom })
		if (speed !== 0) {
			this.#scroll_container.scrollBy(0, speed)
			this.#update_drop_slot()
		}
		this.#scroll_frame = requestAnimationFrame(this.#auto_scroll)
	}

	#release() {
		const { active, drop_slot } = this
		this.#finish()
		if (!active) return

		suppress_next_click()
		if (drop_slot === null) return

		this.#options.on_drop({ drag_index: active.drag_index, range_length: active.range_length, slot: drop_slot })
	}

	#finish() {
		this.#listeners?.abort()
		this.#listeners = null
		this.#press = null
		this.#scroll_container = null
		cancelAnimationFrame(this.#scroll_frame)
		this.active = null
		this.drop_slot = null
	}
}

function find_slot_at_point({ x, y }: Point): number | null {
	const element = document.elementFromPoint(x, y)

	const slot_element = element?.closest<HTMLElement>('[data-drop-slot]')
	if (slot_element) return Number(slot_element.dataset.dropSlot)

	const entity_element = element?.closest<HTMLElement>('[data-entity-index]')
	if (!entity_element) return null

	const { left, width } = entity_element.getBoundingClientRect()
	return get_slot_beside_entity({ index: Number(entity_element.dataset.entityIndex), pointer_x: x, left, width })
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
