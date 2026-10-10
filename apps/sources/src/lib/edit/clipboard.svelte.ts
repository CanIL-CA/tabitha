import type { PageSourceEntity } from '#lib/types.js'
class EntityClipboard {
	copied_entities: PageSourceEntity[] | null = $state.raw(null)

	has_value() {
		return !!this.copied_entities
	}

	peek() {
		return this.copied_entities?.at(0)
	}

	copy(entities: PageSourceEntity[]) {
		this.copied_entities = $state.snapshot(entities)
	}

	paste() {
		const value = this.copied_entities
		this.copied_entities = null
		return value
	}
}


export const entity_clipboard = new EntityClipboard()