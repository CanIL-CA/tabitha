import {
	find_theta_argument,
	head_phrase_by_part_of_speech,
	is_boundary_end,
	is_boundary_start,
} from './format.js'
import { theta_grid_arguments, usage_info } from '#lib/lookups.js'
import type { CuratedExampleEntityStructured } from '#lib/types.js'
import type { PartOfSpeech } from '@tabitha/types'

type Encoding = CuratedExampleEntityStructured[]

// A slot is one of the things a concept's categories say about its case frame or usage: the argument of a verb, or the usage of another word.
// It is the position in the theta grid or usage_info, so it is also the position in the categories (after any offset).

const ADJECTIVE_SLOTS = {
	attributive: 0,
	predicative_without_argument: 1,
	predicative_with_nominal_argument: 2,
	predicative_with_same_participant_clause: 3,
	predicative_with_different_participant_clause: 4,
	comparative: 5,
}

// A context is the word's parent category, optionally followed by its grandparent's: 'Noun Phrase > Clause'.
const USAGE_SLOT_BY_CONTEXT: Partial<Record<PartOfSpeech, Record<string, number>>> = {
	Adposition: { 'Noun Phrase > Clause': 0, 'Noun Phrase > Noun Phrase': 1, 'Clause': 2 },
	Adverb: { 'Adverb Phrase > Clause': 0, 'Adverb Phrase > Noun Phrase': 1, 'Adverb Phrase > Adjective Phrase': 2 },
	Conjunction: { 'Clause': 0, 'Noun Phrase': 1, 'Adjective Phrase': 2, 'Adverb Phrase': 3 },
}

const OPTIONAL_CATEGORY = /^\((.*)\)$/

export const has_case_frame = (part_of_speech: PartOfSpeech): boolean => part_of_speech === 'Verb' || part_of_speech in usage_info

/** What a slot is called to the user: the name of a theta grid argument, or the description of a usage. */
export function get_slot_labels(part_of_speech: PartOfSpeech): string[] {
	return part_of_speech === 'Verb' ? theta_grid_arguments : usage_info[part_of_speech] ?? []
}

//===============
// Finding the slots an example shows

const get_category = ({ encoding, index }: { encoding: Encoding; index: number }): string =>
	index === -1 ? 'Clause' : encoding[index].category

const find_child_indexes = ({ encoding, parent_index }: { encoding: Encoding; parent_index: number }): number[] =>
	encoding.flatMap((entity, index) =>
		entity.parent === parent_index && is_boundary_start(entity) ? [index] : [],
	)

function find_enclosing_clause_index({ encoding, index }: { encoding: Encoding; index: number }): number {
	const parent_index = encoding[index].parent
	if (parent_index === -1 || get_category({ encoding, index: parent_index }) === 'Clause') return parent_index

	return find_enclosing_clause_index({ encoding, index: parent_index })
}

function find_verb_slots({ encoding, word_index }: { encoding: Encoding; word_index: number }): number[] {
	const clause_index = find_enclosing_clause_index({ encoding, index: word_index })
	const argument_names = find_child_indexes({ encoding, parent_index: clause_index }).flatMap(index => {
		const { category, feature_codes } = encoding[index]
		const argument_name = feature_codes && find_theta_argument({ category, code: feature_codes })
		return argument_name ? [argument_name] : []
	})
	return argument_names.map(name => theta_grid_arguments.indexOf(name))
}

// An argument of an adjective is a nominal one or a clause, and a clause is the same participant or a different one. If that is not known, the usage is not either.
function find_predicative_adjective_slots({ encoding, phrase_index }: { encoding: Encoding; phrase_index: number }): number[] {
	const argument_indexes = find_child_indexes({ encoding, parent_index: phrase_index })
	if (!argument_indexes.length) return [ADJECTIVE_SLOTS.predicative_without_argument]

	return argument_indexes.flatMap(index => {
		const argument = encoding[index]
		if (argument.category === 'Noun Phrase') return [ADJECTIVE_SLOTS.predicative_with_nominal_argument]
		if (argument.features.some(({ name, value }) => name === 'Participant' && value === 'Same')) return [ADJECTIVE_SLOTS.predicative_with_same_participant_clause]
		if (argument.features.some(({ name, value }) => name === 'Participant' && value === 'Different')) return [ADJECTIVE_SLOTS.predicative_with_different_participant_clause]
		return []
	})
}

// The usage is read from the structure, not the Usage feature.
function find_adjective_slots({ encoding, word_index }: { encoding: Encoding; word_index: number }): number[] {
	const phrase_index = encoding[word_index].parent
	const container_category = get_category({ encoding, index: encoding[phrase_index].parent })
	const usage_slots =
		['Noun Phrase', 'Adjective Phrase'].includes(container_category) ? [ADJECTIVE_SLOTS.attributive]
			: container_category === 'Clause' ? find_predicative_adjective_slots({ encoding, phrase_index })
				: []

	const is_comparative = encoding[word_index].features.some(f => f.name === 'Degree')
	return [...usage_slots, ...is_comparative ? [ADJECTIVE_SLOTS.comparative] : []]
}

function find_usage_slots({ encoding, word_index, part_of_speech }: { encoding: Encoding; word_index: number; part_of_speech: PartOfSpeech }): number[] {
	const slot_by_context = USAGE_SLOT_BY_CONTEXT[part_of_speech] ?? {}
	const parent_index = encoding[word_index].parent
	const parent_category = get_category({ encoding, index: parent_index })
	const grandparent_category = parent_index === -1 ? '' : get_category({ encoding, index: encoding[parent_index].parent })

	const slot = slot_by_context[parent_category] ?? slot_by_context[`${parent_category} > ${grandparent_category}`]
	return slot === undefined ? [] : [slot]
}

// A word is found by its stem, in the phrase that its part of speech heads, where it has one.
function find_word_index({ encoding, stem, part_of_speech }: { encoding: Encoding; stem: string; part_of_speech: PartOfSpeech }): number {
	const head_phrase = head_phrase_by_part_of_speech[part_of_speech]
	return encoding.findIndex((entity, index) =>
		!is_boundary_start(entity)
		&& !is_boundary_end(entity)
		&& entity.value === stem
		&& (!head_phrase || get_category({ encoding, index: encoding[index].parent }) === head_phrase),
	)
}

type FindPresentSlotsOptions = {
	part_of_speech: PartOfSpeech
	stem: string
	encoding: Encoding
}

/**
 * The slots that an example shows its word using, in order. Undefined when the part of speech has no case frame, or the word is not in the example.
 */
export function find_present_slots({ part_of_speech, stem, encoding }: FindPresentSlotsOptions): number[] | undefined {
	if (!has_case_frame(part_of_speech)) return undefined

	const word_index = find_word_index({ encoding, stem, part_of_speech })
	if (word_index === -1) return undefined

	const slots = part_of_speech === 'Verb' ? find_verb_slots({ encoding, word_index })
		: part_of_speech === 'Adjective' ? find_adjective_slots({ encoding, word_index })
			: find_usage_slots({ encoding, word_index, part_of_speech })
	return [...new Set(slots)].filter(slot => slot >= 0).sort((a, b) => a - b)
}

//===============
// Comparing with what the concept says

type SlotStatus = 'required' | 'optional' | 'unused'

type CategoriesOptions = {
	part_of_speech: PartOfSpeech
	categories: string[]
}

const USAGE_STATUS_BY_FREQUENCY: Record<string, SlotStatus> = { always: 'required', sometimes: 'optional' }

// Adjective categories start with the semantic category, so their usages begin at position 1.
const get_usage_offset = (part_of_speech: PartOfSpeech): number => part_of_speech === 'Adjective' ? 1 : 0

function read_slot_statuses({ part_of_speech, categories }: CategoriesOptions): SlotStatus[] {
	if (part_of_speech === 'Verb') {
		return theta_grid_arguments.map(argument => {
			const category = categories.find(category => category.replace(OPTIONAL_CATEGORY, '$1') === argument)
			if (category === undefined) return 'unused'
			return OPTIONAL_CATEGORY.test(category) ? 'optional' : 'required'
		})
	}

	const offset = get_usage_offset(part_of_speech)
	return get_slot_labels(part_of_speech).map((_, slot) => USAGE_STATUS_BY_FREQUENCY[categories[offset + slot]?.split(' ')[0] ?? ''] ?? 'unused')
}

export type CaseFrameChange = {
	/** shown by the example, but unused by the concept */
	new_slots: number[]
	/** required by the concept, but not shown by the example */
	absent_slots: number[]
}

type PresentSlotsOptions = CategoriesOptions & {
	present_slots: number[]
}

export function compare_case_frame({ part_of_speech, categories, present_slots }: PresentSlotsOptions): CaseFrameChange {
	const statuses = read_slot_statuses({ part_of_speech, categories })

	return {
		new_slots: present_slots.filter(slot => statuses[slot] === 'unused'),
		absent_slots: statuses.flatMap((status, slot) => status === 'required' && !present_slots.includes(slot) ? [slot] : []),
	}
}

const blank_categories = (part_of_speech: PartOfSpeech): string[] =>
	part_of_speech === 'Verb' ? theta_grid_arguments.map(() => '')
		: [...part_of_speech === 'Adjective' ? ['Generic'] : [], ...get_slot_labels(part_of_speech).map(usage => `never ${usage}`)]

function make_optional({ part_of_speech, slot }: { part_of_speech: PartOfSpeech; slot: number }): string {
	const label = get_slot_labels(part_of_speech)[slot]
	return part_of_speech === 'Verb' ? `(${label})` : `sometimes ${label}`
}

/**
 * The categories after adding what the example shows that the concept does not yet have, and making optional what the concept requires but the example does without.
 * Everything else is kept. The categories of a verb are returned in the order of the theta grid, one for each argument, empty if unused.
 */
export function suggest_categories({ part_of_speech, categories, present_slots }: PresentSlotsOptions): string[] {
	if (!has_case_frame(part_of_speech)) return [...categories]

	const { new_slots, absent_slots } = compare_case_frame({ part_of_speech, categories, present_slots })
	const base_categories = categories.length ? categories : blank_categories(part_of_speech)
	const positional_categories = part_of_speech === 'Verb'
		? theta_grid_arguments.map(argument => base_categories.find(category => category.replace(OPTIONAL_CATEGORY, '$1') === argument) ?? '')
		: blank_categories(part_of_speech).map((blank_category, position) => base_categories[position] ?? blank_category)

	const offset = get_usage_offset(part_of_speech)
	const changed_categories = new Map([...new_slots, ...absent_slots].map(slot => [slot + offset, make_optional({ part_of_speech, slot })]))
	return positional_categories.map((category, position) => changed_categories.get(position) ?? category)
}
