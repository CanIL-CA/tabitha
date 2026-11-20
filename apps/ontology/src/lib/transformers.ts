import {
	closing_bracket_by_opening,
	decode_token,
	fallback_code_by_category,
	is_boundary_end,
	is_boundary_start,
	start_token_by_category,
} from '#lib/curated_example/format.js'
import {
	parts_of_speech,
	semantic_category,
	sources,
	theta_grid,
	theta_grid_arguments,
	usage_info,
} from '#lib/lookups.js'
import type { Concept, CuratedExample, CuratedExampleEncoding, CuratedExampleEntity, EncodedCuratedExample } from '#lib/types.js'
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
	// ready-B:
	//   6,8,1,37|(NPA|John|)|(VP|be|)|(APP|ready|[p|(NPA|John|)|(VP|read|)|(NPP|book|)|]|)|~John is ready to read that book.

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

		function decode_simplified_encoding(entities_encoded: string[]): CuratedExampleEncoding {
			// (NPA => { category: 'Noun Phrase', category_abbr: 'NP', value: '(', feature_codes: 'A', features: [{ name: 'Semantic Role', value: 'Most Agent-like' }] }
			// baby => { category: '', category_abbr: '', value: 'baby', feature_codes: '', features: [] }
			// ) => { category: '', category_abbr: '', value: ')', feature_codes: '', features: [] }
			// (VP => { category: 'Verb Phrase', category_abbr: 'VP', value: '(', feature_codes: '', features: [] }
			// (APP => { category: 'Adjective Phrase', category_abbr: 'AdjP', value: '(', feature_codes: 'P', features: [{ name: 'Usage', value: 'Predicative' }] }
			// [A => { category: 'Clause', category_abbr: 'Prop', value: '[', feature_codes: 'A', features: [{ name: 'Type', value: 'Agent (Subject Complement)' }] }
			return entities_encoded.map(decode_token)
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

class CuratedExampleEncodingError extends Error {}

const NON_NEGATIVE_INTEGER = /^\d+$/
const WORD_CATEGORIES = new Set<string>(parts_of_speech)

type EncodeCuratedExampleOptions = {
	readonly reference: Reference
	readonly sentence: string
	readonly encoding: CuratedExampleEncoding
}

/**
 * Turns the entities of an example into one line of the curated examples format, the reverse of transform_curated_examples.
 *
 * Example output:
 * "4,2,2,2|(NPA|baby|)|(VP|be|)|(APP|beautiful|)|~The baby was beautiful."
 */
export function encode_curated_example({ reference, sentence, encoding }: EncodeCuratedExampleOptions): EncodedCuratedExample {
	try {
		const encoded_reference = encode_reference(reference)
		const encoded_sentence = validate_sentence(sentence)
		const encoded_entities = encode_entities(encoding)
		return { encoded_example: `${encoded_reference}|${encoded_entities.join('|')}|~${encoded_sentence}` }
	} catch (error) {
		if (error instanceof CuratedExampleEncodingError) return { error: error.message }
		throw error
	}
}

function validate_sentence(sentence: string): string {
	const trimmed_sentence = sentence.trim()
	if (!trimmed_sentence) throw new CuratedExampleEncodingError('The English sentence is empty.')
	if (/[|\r\n]/.test(trimmed_sentence)) throw new CuratedExampleEncodingError('The English sentence cannot contain "|" or a line break.')

	return trimmed_sentence
}

/**
 * The reverse of decode_reference
 * @returns e.g., '4,2,2,2'
 */
function encode_reference(reference: Reference): string {
	const type_key = [...sources.keys()].indexOf(reference.type)
	const book_key = Object.entries(sources.get(reference.type) ?? {}).find(([, book]) => book === reference.id_primary)?.[0]
	const has_numeric_ids = NON_NEGATIVE_INTEGER.test(reference.id_secondary) && NON_NEGATIVE_INTEGER.test(reference.id_tertiary)
	if (book_key === undefined || !has_numeric_ids) {
		const reference_label = `${reference.type} ${reference.id_primary} ${reference.id_secondary}:${reference.id_tertiary}`
		throw new CuratedExampleEncodingError(`The reference ${reference_label} cannot be used in a curated example.`)
	}

	return [type_key, book_key, Number(reference.id_secondary), Number(reference.id_tertiary)].join(',')
}

function encode_entity(entity: CuratedExampleEntity): string {
	const { category, value, feature_codes } = entity
	if (is_boundary_end(entity)) return value

	if (is_boundary_start(entity)) {
		const start_token = start_token_by_category[category]
		if (start_token === undefined) throw new CuratedExampleEncodingError(`A ${category || 'part'} cannot be used in a curated example.`)
		return start_token + (feature_codes || fallback_code_by_category[category] || '')
	}

	if (category !== '' && !WORD_CATEGORIES.has(category)) throw new CuratedExampleEncodingError(`A ${category} cannot be used in a curated example.`)
	if (!value || value.includes('|')) throw new CuratedExampleEncodingError(`The word "${value}" cannot be used in a curated example.`)
	return value
}

function check_brackets_balanced(encoding: CuratedExampleEncoding) {
	const open_brackets: string[] = []
	for (const entity of encoding) {
		if (is_boundary_start(entity)) open_brackets.push(entity.value)
		if (!is_boundary_end(entity)) continue

		const open_bracket = open_brackets.pop()
		if (open_bracket === undefined) throw new CuratedExampleEncodingError('A closing bracket has no opening bracket.')
		if (closing_bracket_by_opening[open_bracket] !== entity.value) throw new CuratedExampleEncodingError('A closing bracket does not match its opening bracket.')
	}

	if (open_brackets.length) throw new CuratedExampleEncodingError('An opening bracket has no closing bracket.')
}

function encode_entities(encoding: CuratedExampleEncoding): string[] {
	if (!encoding.length) throw new CuratedExampleEncodingError('There is nothing to encode.')
	check_brackets_balanced(encoding)

	return encoding.map(encode_entity)
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

		return categories.map(encode_usage).join('')

		/**
		 * @param sentence the full usage sentence starting with 'always', 'sometimes', or 'never'
		 * @param position the position within the categorization string
		 * @returns the categorization character [ABC|abc|_]
		 */
		function encode_usage(sentence: string, position: number): string {
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

