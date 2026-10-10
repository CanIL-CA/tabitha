import {
	curated_example_category_codes,
	curated_example_feature_codes,
	semantic_category,
	sources,
	theta_grid,
	theta_grid_arguments,
	usage_info,
} from '#lib/lookups.js'
import type { Concept, CuratedExample, SimplifiedEncodingEntity, SimplifiedSemanticEncoding } from '#lib/types.js'
import type { PartOfSpeech, Reference } from '@tabitha/types'

/**
 * Transforms raw curated examples string from DB into structured CuratedExample objects.
 *
 * Example input:
 * "4,2,2,2|(NPp|baby|)|(VP|be|)|(APP|beautiful|)|~The baby was beautiful.\n4,17,2,2|(NPp|Xerxes|)|(VP|search|)|(NPP|(APA|beautiful|)|virgin|)|~Xerxes searched for a beautiful virgin.\n"
 */
export function transform_curated_examples(curated_examples_raw: string): CuratedExample[] {
	if (!curated_examples_raw) return []
	const encoded_examples = curated_examples_raw.split('\n').filter(field => !!field)
	// beautiful-A:
	//   4,2,2,2|(NPA|baby|)|(VP|be|)|(APP|beautiful|)|~The baby was beautiful.
	//   4,17,2,2|(NPA|Xerxes|)|(VP|search|)|(NPP|(APA|beautiful|)|virgin|)|~Xerxes searched for a beautiful virgin.
	//   4,40,6,29|(NPA|clothes|(NPN|of|flower|)|)|(VP|be|)|(APP|beautiful|(NPN|clothes|(NPN|of|Solomon|)|)|)|~The flower's clothes are more beautiful than Solomon's clothes.
	// be-V:
	//   6,8,1,67|[A|(NPA|John|)|(VP|read|)|(NPP|book|)|]|(VP|be|)|(APP|true|)|~It is true that John read that book.
	//   4,41,14,21|[A|(NPA|man|)|(VP|born|)|(aP|never|)|]|(VP|be|)|(APP|good|)|(NPB|man|)|~It's better for that man that he was never born.

	return encoded_examples.map(decode)

	/**
	 * @example "4,2,2,2|(NPp|baby|)|(VP|be|)|(APP|beautiful|)|~The baby was beautiful."
	 */
	function decode(encoded_example: string): CuratedExample {
		const parts = encoded_example.split('|')
		const encoded_reference = parts[0] // '4,2,2,2'
		const encoded_entities = parts.slice(1, -1) // ['(NPA', 'baby', ')', '(VP', 'be', ')', '(APP', 'beautiful', ')']
		const sentence = parts.at(-1)?.slice(1) || '' // The baby was beautiful. (ignore the '~')

		return {
			reference: decode_reference(encoded_reference),
			encoding: decode_simplified_encoding(encoded_entities),
			sentence,
		}

		function decode_simplified_encoding(entities_encoded: string[]): SimplifiedSemanticEncoding {
			return entities_encoded.map(decode_entity)

			function decode_entity(encoded_entity: string): SimplifiedEncodingEntity {
				// (NPA => { category: 'NP', value: '(', feature: { code: 'A', value: 'Most Agent-like' } }
				// baby => { category: 'value', value: 'baby', feature: undefined }
				// ) => { category: 'Phrase end', value: ')', feature: undefined }
				// (VP => { category: 'VP', value: '(', feature: undefined }
				// (APP => { category: 'AdjP', value: '(', feature: { code: 'P', value: 'Predicative' } }
				// [A => { category: 'Clause', value: '[', feature: { code: 'A', value: 'Agent' } }

				const category =
					Object.entries(curated_example_category_codes).find(([code]) =>
						encoded_entity.startsWith(code),
					)?.[1] || 'Word'
				const feature_code = encoded_entity.at(-1) || ''
				const feature_value = curated_example_feature_codes[category]?.[feature_code]
				return {
					category,
					word: category === 'Word' ? encoded_entity : undefined,
					feature: feature_value ? { code: feature_code, value: feature_value } : undefined,
				}
			}
		}
	}
}

/**
 * Decodes four numbers separated by commas into a Reference object
 * @param encoded_reference e.g., '4,2,2,2'
 */
function decode_reference(encoded_reference: string): Reference {
	const [type_key, primary_key, id_secondary, id_tertiary] = encoded_reference.split(',').map(Number)
	const source_entries = [...sources.entries()]
	const [type, primary_keys] = source_entries[type_key] ?? ['Unknown', {}]

	return {
		type,
		id_primary: primary_keys[primary_key] ?? '',
		id_secondary: String(id_secondary),
		id_tertiary: String(id_tertiary),
	}
}

const categorization_decoders: Record<string, (categories_from_db: string) => string[]> = {
	Adjective: transform_adjective_categorization,
	Adposition: transform_particle_categorization('Adposition'),
	Adverb: transform_particle_categorization('Adverb'),
	Conjunction: transform_particle_categorization('Conjunction'),
	Noun: transform_noun_categorization,
	Verb: transform_verb_categorization,
}

type DecodeCategorizationOptions = {
	readonly part_of_speech: string
	readonly categorization: string
}

export function decode_categorization({ part_of_speech, categorization }: DecodeCategorizationOptions): string[] {
	const decoder = categorization_decoders[part_of_speech]
	return decoder ? decoder(categorization) : [...categorization]
}

export function decode_categorization_for_update({ part_of_speech, categorization }: DecodeCategorizationOptions): string[] {
	const categories = decode_categorization({ part_of_speech, categorization })

	if (part_of_speech === 'Verb') {
		// The above decoder removes empty theta grid arguments, so they are not in a consistent sequence.
		// For the purpose of 'update', we need to fill in the gaps.
		return theta_grid_arguments.map(arg => categories.find(category => category.includes(arg)) || '')
	}

	return categories
}

/**
 * @param categories_from_db '[Aa_][Bb_][Cc_][Dd_][Ee_][Ff_][Gg_][Hh_][Ii_]'
 * @returns The decoded categories, e.g., ['Agent-like', '(Patient-like)', '', '', '', '', '', '', '']
 */
function transform_verb_categorization(categories_from_db: string): string[] {
	const encoded_categories = [...categories_from_db]
	return encoded_categories.filter(populated).map(encoded_category => theta_grid[encoded_category] || '')

	function populated(encoded_category: string): boolean {
		return encoded_category !== '_'
	}
}

/**
 * @param categories_from_db '[GCOFQIL][Aa_][Bb_][Cc_][Dd_][Ee_][Ff_]' OR ''
 * Position 1 is the semantic category, remaining positions are usage (DisplayOntologyDlg.cppL1064)
 */
function transform_adjective_categorization(categories_from_db: string): string[] {
	if (!categories_from_db) {
		return []
	}

	const [encoded_semantic_category, ...encoded_usage] = categories_from_db

	return [
		semantic_category.Adjective?.[encoded_semantic_category] || '',
		...transform_particle_categorization('Adjective')(encoded_usage.join('')),
	]
}

/**
 * @param categories_from_db '[AFGMOTgo]' OR ''
 * @returns e.g., ['Abstracts'] or ['Feminine names'] or ['All other objects']
 */
function transform_noun_categorization(categories_from_db: string): string[] {
	if (!categories_from_db) return ['No information available yet.']
	return [
		semantic_category.Noun?.[categories_from_db[0]] || 'No information available yet.',
	]
}

function transform_particle_categorization(part_of_speech: string): (categories_from_db: string) => string[] {
	return function decode_categories(categories_from_db: string): string[] {
		if (!categories_from_db) {
			return []
		}

		return [...decode_usage([...categories_from_db])]

		/**
		 * Encoding is a combination of position and case, letters are actually irrelevant.
		 * @param encoded_usage ['Aa_', 'Bb_', 'Cc_']
		 * @returns various sentences from the usage_info lookup
		 */
		function decode_usage(encoded_usage: string[]): string[] {
			const info_list = usage_info[part_of_speech as PartOfSpeech] || []
			return encoded_usage.map((character, i) => `${decode_frequency(character)} ${info_list[i] || ''}`)
		}

		/**
		 * @param character uppercase, lowercase, or underscore
		 * @returns "always", "sometimes", or "never"
		 */
		function decode_frequency(character: string): string {
			return character === '_' ? 'never' : character === character.toUpperCase() ? 'always' : 'sometimes'
		}
	}
}

const categorization_encoders: Record<string, (categories: string[]) => string> = {
	Adjective: encode_adjective_categorization,
	Adposition: encode_usage_categorization('Adposition'),
	Adverb: encode_usage_categorization('Adverb'),
	Conjunction: encode_usage_categorization('Conjunction'),
	Noun: encode_noun_categorization,
	Verb: encode_verb_categorization,
}

type EncodeCategorizationOptions = {
	readonly part_of_speech: string
	readonly categories: string[]
}

export function encode_categorization({ part_of_speech, categories }: EncodeCategorizationOptions): string {
	const encoder = categorization_encoders[part_of_speech]
	return encoder ? encoder(categories) : ''
}

/**
 * @param categories e.g., ['Abstracts']
 * @returns e.g., 'A' or 'o'
 */
function encode_noun_categorization(categories: string[]): string {
	const category = categories[0]
	if (!category) {
		return 'o'
	}
	return Object.entries(semantic_category.Noun || {}).find(([, value]) => value === category)?.[0] || 'o'
}

function encode_verb_categorization(categories: string[]): string {
	const argument_map = Object.fromEntries(Object.entries(theta_grid).map(([letter, category]) => [category, letter]))
	return categories.map(category => argument_map[category] || '').join('')
}

/**
 * Position 1 is semantic category, remaining positions are usage (DisplayOntologyDlg.cppL1064)
 * @returns e.g. '[GCOFQIL][Aa_][Bb_][Cc_][Dd_][Ee_][Ff_]'
 */
function encode_adjective_categorization(categories: string[]): string {
	const adjective_usages = usage_info.Adjective || []
	if (categories.length === 0) {
		return `G${'_'.repeat(adjective_usages.length)}`
	}

	const [category, ...usages] = categories
	const encoded_category = Object.entries(semantic_category.Adjective || {}).find(([, value]) => value === category)?.[0] || 'G'

	return `${encoded_category}${encode_usage_categorization('Adjective')(usages)}`
}

function encode_usage_categorization(part_of_speech: string): (categories: string[]) => string {
	return function encode_categories(categories: string[]): string {
		const usages = usage_info[part_of_speech as PartOfSpeech] || []

		if (categories.length === 0) {
			return '_'.repeat(usages.length)
		}

		return categories.map((sentence, position) => encode_usage({ sentence, position })).join('')

		/**
		 * @param sentence the full usage sentence starting with 'always', 'sometimes', or 'never'
		 * @param position the position within the categorization string
		 * @returns the categorization character [ABC|abc|_]
		 */
		function encode_usage({ sentence, position }: {
			sentence: string
			position: number
		}): string {
			return encode_frequency({ sentence, character: get_usage_character(position) })
		}

		/**
		 * @param sentence starting with "always", "sometimes", or "never"
		 * @param character the position-based upper-case character
		 */
		function encode_frequency({ sentence, character }: { sentence: string, character: string }): string {
			return sentence.startsWith('never') ? '_' : sentence.startsWith('always') ? character : character.toLowerCase()
		}

		function get_usage_character(i: number): string {
			return String.fromCharCode('A'.charCodeAt(0) + i)
		}
	}
}

/**
 * Creates a minimal fallback Concept object from partial data.
 * Useful for initializing header displays in concept creation/update forms.
 */
export function create_fallback_concept(
	data: Partial<Omit<Concept, 'curated_examples'> & { curated_examples?: string | CuratedExample[] }> = {},
): Concept {
	const { curated_examples, ...rest } = data
	const curated_examples_list: CuratedExample[] = Array.isArray(curated_examples) ? curated_examples : []
	const curated_examples_str: string = typeof curated_examples === 'string' ? curated_examples : ''

	return {
		id: '',
		stem: '',
		sense: '',
		part_of_speech: 'Noun',
		level: '1',
		gloss: '',
		brief_gloss: '',
		categorization: '',
		categories: [],
		curated_examples: curated_examples_list,
		curated_examples_raw: curated_examples_str,
		occurrences: 0,
		status: 'not used',
		how_to_hints: [],
		pending_changes: [],
		examples: '',
		...rest,
	}
}

