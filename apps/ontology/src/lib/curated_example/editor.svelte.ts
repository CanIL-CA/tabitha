import { compare_case_frame, find_present_slots, get_slot_labels, has_case_frame, suggest_categories } from './case_frame.js'
import { is_boundary_end, is_boundary_start, is_duplicate_example, put_example } from './format.js'
import { encode_curated_example, structure_curated_example_encoding } from '#lib/transformers.js'
import type { CuratedExampleEntityStructured, EncodedCuratedExample } from '#lib/types.js'
import type { ConceptKey, Reference } from '@tabitha/types'

type Entity = CuratedExampleEntityStructured
type Encoding = Entity[]

type CuratedExampleEditorOptions = {
	/** The concept the example is for, whose word has to stay in the example */
	concept: ConceptKey
	/** The categories the concept has now */
	categories: string[]
	/** All of the concept's curated examples, as the text they are kept in */
	curated_examples: string
	reference: Reference
	encoding: Encoding
	sentence: string
	/** The index of the existing example that saving replaces, if it replaces one */
	replaces: number | null
}

export type CaseFrameChangeLine = {
	kind: 'new' | 'no'
	label: string
}

const same_categories = ({ a, b }: { a: string[]; b: string[] }): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * The state of the page that adds or edits a curated example of a concept: the entities that are left after the user deletes some,
 * the English for them, and the categories the example calls for. It works out what changes and whether it can be saved.
 */
export class CuratedExampleEditor {
	readonly #options: CuratedExampleEditorOptions

	encoding = $state.raw<Encoding>([])
	sentence = $state('')
	/** What the user is editing. It follows what the example calls for until the user changes it. */
	categories = $state<string[]>([])
	hovered_index = $state<number | null>(null)

	deletable_roots: number[]
	hovered_unit_indexes: Set<number>
	/** The slots the example shows the concept's word using, if there is a case frame to compare with */
	present_slots: number[] | undefined
	suggested_categories: string[]
	case_frame_changes: CaseFrameChangeLine[]
	/** The line the example is written as, or why it cannot be */
	encoded: EncodedCuratedExample
	encoded_example: string | undefined
	/** Why the example cannot be saved yet, or an empty string */
	validation_message: string
	curated_examples_to_save: string | undefined

	constructor(options: CuratedExampleEditorOptions) {
		this.#options = options
		this.encoding = options.encoding
		this.sentence = options.sentence
		this.categories = this.#suggest_categories(options.encoding)

		const { concept, categories, curated_examples, reference, replaces } = options

		this.deletable_roots = $derived(find_deletable_roots({ encoding: this.encoding, stem: concept.stem }))
		this.hovered_unit_indexes = $derived.by(() => {
			const root = this.#find_root(this.hovered_index)
			return new Set(root === undefined ? [] : find_unit({ encoding: this.encoding, index: root }))
		})

		this.present_slots = $derived(find_present_slots({ part_of_speech: concept.part_of_speech, stem: concept.stem, encoding: this.encoding }))
		this.suggested_categories = $derived(this.#suggest_categories(this.encoding))
		this.case_frame_changes = $derived.by(() => {
			if (!this.present_slots) return []

			const labels = get_slot_labels(concept.part_of_speech)
			const { new_slots, absent_slots } = compare_case_frame({ part_of_speech: concept.part_of_speech, categories, present_slots: this.present_slots })
			return [
				...new_slots.map((slot): CaseFrameChangeLine => ({ kind: 'new', label: labels[slot] })),
				...absent_slots.map((slot): CaseFrameChangeLine => ({ kind: 'no', label: labels[slot] })),
			]
		})

		this.encoded = $derived(encode_curated_example({ reference, sentence: this.sentence, encoding: this.encoding }))
		this.encoded_example = $derived('encoded_example' in this.encoded ? this.encoded.encoded_example : undefined)
		this.validation_message = $derived.by(() => {
			const has_word = this.encoding.some(entity => !is_boundary_start(entity) && !is_boundary_end(entity) && entity.value === concept.stem)
			if (!has_word) return `The example does not use "${concept.stem}".`
			if ('error' in this.encoded) return this.encoded.error
			if (is_duplicate_example({ curated_examples, encoded_example: this.encoded.encoded_example, replaces })) return 'The concept already has this example.'
			return ''
		})
		this.curated_examples_to_save = $derived(
			this.encoded_example && !this.validation_message ? put_example({ curated_examples, encoded_example: this.encoded_example, replaces }) : undefined,
		)
	}

	get has_case_frame(): boolean {
		return has_case_frame(this.#options.concept.part_of_speech)
	}

	/** Whether the categories are still what the example calls for, so that changing the example can change them. */
	get is_following_example(): boolean {
		return same_categories({ a: this.categories, b: this.suggested_categories })
	}

	#suggest_categories(encoding: Encoding): string[] {
		const { concept, categories } = this.#options
		const present_slots = find_present_slots({ part_of_speech: concept.part_of_speech, stem: concept.stem, encoding })
		return present_slots ? suggest_categories({ part_of_speech: concept.part_of_speech, categories, present_slots }) : [...categories]
	}

	#find_root(index: number | null): number | undefined {
		if (index === null) return undefined

		return find_unit_root({ encoding: this.encoding, deletable_roots: this.deletable_roots, index })
	}

	is_deletable(index: number): boolean {
		return this.#find_root(index) !== undefined
	}

	hover(index: number | null) {
		this.hovered_index = index
	}

	/** Deletes the unit that holds the entity. The categories change with the example unless the user has changed them. */
	delete_unit(index: number) {
		const root = this.#find_root(index)
		if (root === undefined) return

		const was_following_example = this.is_following_example
		this.encoding = remove_unit({ encoding: this.encoding, root })
		this.hovered_index = null
		if (was_following_example) this.categories = this.suggested_categories
	}

	apply_suggestion() {
		this.categories = this.suggested_categories
	}

	reset() {
		const { encoding, sentence } = this.#options
		this.encoding = encoding
		this.sentence = sentence
		this.hovered_index = null
		this.categories = this.#suggest_categories(encoding)
	}
}

// A unit is what the user deletes at once: a phrase or clause with everything in it, or a word that is directly in a clause.
// The word the example is for always stays, along with everything that holds it.

const is_word = (entity: Entity): boolean => !is_boundary_start(entity) && !is_boundary_end(entity)

function is_unit_root({ encoding, index }: { encoding: Encoding; index: number }): boolean {
	const entity = encoding[index]
	if (is_boundary_start(entity)) return true
	if (!is_word(entity)) return false

	const parent_index = encoding[index].parent
	return parent_index === -1 || encoding[parent_index].category === 'Clause'
}

/** The indexes of the unit that starts at the index. Undefined when a phrase or clause is never closed. */
export function find_unit({ encoding, index }: { encoding: Encoding; index: number }): number[] | undefined {
	if (!is_boundary_start(encoding[index])) return [index]

	const end_index = encoding.findIndex((entity, i) => i > index && is_boundary_end(entity) && encoding[i].parent === index)
	if (end_index === -1) return undefined

	return Array.from({ length: end_index - index + 1 }, (_, offset) => index + offset)
}

/** The indexes where a unit that can be deleted starts, which are those that leave a word equal to the stem. */
export function find_deletable_roots({ encoding, stem }: { encoding: Encoding; stem: string }): number[] {
	return encoding.flatMap((_, index) => {
		if (!is_unit_root({ encoding, index })) return []

		const unit = find_unit({ encoding, index })
		if (!unit) return []

		const keeps_word = encoding.some((entity, i) => !unit.includes(i) && is_word(entity) && entity.value === stem)
		return keeps_word ? [index] : []
	})
}

/** The innermost deletable unit that holds the entity, which is what clicking the entity deletes. */
export function find_unit_root({ encoding, deletable_roots, index }: { encoding: Encoding; deletable_roots: number[]; index: number }): number | undefined {
	if (index < 0 || index >= encoding.length) return undefined
	if (deletable_roots.includes(index)) return index

	return find_unit_root({ encoding, deletable_roots, index: encoding[index].parent })
}

/** The encoding without the unit, with where each entity sits worked out again, since the entities after the unit are at new indexes. */
export function remove_unit({ encoding, root }: { encoding: Encoding; root: number }): Encoding {
	const unit = find_unit({ encoding, index: root })
	return unit ? structure_curated_example_encoding(encoding.filter((_, index) => !unit.includes(index))) : encoding
}