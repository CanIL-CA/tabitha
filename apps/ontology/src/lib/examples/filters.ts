import { book_order_index } from '@tabitha/types/patterns'
import type {
	Concept,
	ContextArgumentMap,
	FilterMap,
	FilterRulesMap,
	Options,
} from '#lib/types.js'

import type { ContextArgumentName, ConceptExample } from '@tabitha/types'

export const context_argument_map: ContextArgumentMap = new Map([
	['Noun', [
		'Complex Handling',
		'Pairing',
		'Role',
		'Verb',
		'Adposition',
		'Outer Noun',
		'Outer Adjective',
		'Outer Adverb',
	]],
	['Verb', [
		'Complex Handling',
		'Pairing',
		'Agent',
		'Patient',
		'State',
		'Source',
		'Destination',
		'Instrument',
		'Beneficiary',
		'Predicate Adjective',
		'Propositional Agent',
		'Propositional Patient',
		'Topic NP',
		'Polarity',
	]],
	['Adjective', [
		'Complex Handling',
		'Pairing',
		'Usage',
		'Agent',
		'Verb',
		'Modified Noun',
		'Modified Adjective',
		'Patient Noun',
		'Patient Clause',
		'Degree',
	]],
	['Adverb', [
		'Complex Handling',
		'Pairing',
		'Verb',
		'Modified Noun',
		'Modified Adjective',
		'Degree',
	]],
	['Adposition', [
		'Noun',
		'Verb',
		'Adjective',
		'Outer Noun',
		'Outer Adjective',
	]],
])

/**
 * Example data:
 * ______________________________________________
 * | Name			| Options 							|
 * | ------------	| --------------------------- |
 * | Book			| Genesis, Exodus, ...			|
 *
 *    ============= person-B ================
 * | Verb			| 'tell-D', 'send-A', ...		|
 * | Role			| 'agent-A', 'state-A', ...	|
 *
 *    ============= person-A ================
 * | Verb			| ...									|
 * | Role			| ...									|
 * | Adposition	| ...									|
 * | Outer Nouns	| ...									|
 *
 *    ============= sleep-A ================
 * | Topic NP		| 'Most Agent-Like'				|
 * | Polarity		| 'Affirmative', 'Negative'	|
 * | Agent			| ...									|
 * | Addressee		| ...									|
 *
 *    ============= speak-A ================
 * | Topic NP		| ...				|
 * | Polarity		| 'Affirmative', 'Negative'	|
 * | Agent			| ...									|
 * | Patient		| ...									|
 * | ...				| ...									|
 *
 *    ============= speak-B ================
 * | Topic NP		| 'Most Agent-Like'				|
 * | Polarity		| 'Affirmative'					|
 * | Agent			| ...									|
 * | Patient		| ...									|
 */
export function derive_filters({ concept, examples }: { concept: Concept, examples: ConceptExample[] }): FilterMap {
	const filters: FilterMap = new Map()

	// The Book filter has to be handled separately because it's a little different than the context filters.
	const book_names_found_in_examples = examples.toSorted((a, b) => book_order_index(a) - book_order_index(b)).map(book_name)
	filters.set('Book', new Set(['Any', ...book_names_found_in_examples]))

	const context_filters: FilterMap = initialize_filter_map().get(concept.part_of_speech) ?? new Map()
	const absence_tracker: Record<ContextArgumentName, number> = {}

	examples.forEach(({ context }) => {
		context_filters.forEach((_options, argument_name) => {
			if (context[argument_name]) {
				context_filters.get(argument_name)?.add(context[argument_name])
			} else {
				absence_tracker[argument_name] = (absence_tracker[argument_name] ?? 0) + 1
			}
		})
	})

	for (const [name, options] of [...context_filters.entries()].filter(has_options)) {
		const common_options = new Set<string>()

		// second condition added because take-A [Instrument and Addressee] both have only one option...
		if (options.size > 1 || absence_tracker[name] && options.size === 1) {
			common_options.add('Any')
		}

		if (absence_tracker[name]) {
			common_options.add('Present')
			common_options.add('Not present')
		}

		const sorted_options = [...options].sort()

		filters.set(name, new Set([...common_options, ...sorted_options]))
	}

	return filters

	function book_name({ reference: { id_primary } }: ConceptExample): string {
		return id_primary
	}

	function initialize_filter_map(): FilterRulesMap {
		const filter_rules_map: FilterRulesMap = new Map()

		for (const [part_of_speech, args] of context_argument_map.entries()) {
			const filter_map: FilterMap = new Map()

			for (const filter_name of args) {
				const options: Options = new Set()
				filter_map.set(filter_name, options)
			}

			filter_rules_map.set(part_of_speech, filter_map)
		}

		return filter_rules_map
	}

	function has_options([, options]: [ContextArgumentName, Options]): boolean {
		return options.size > 0
	}
}

