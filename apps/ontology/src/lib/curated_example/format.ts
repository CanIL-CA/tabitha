import type { CuratedExampleEntity } from '#lib/types.js'
import type { EntityFeature, PartOfSpeech } from '@tabitha/types'

/**
 * Everything about the curated examples format that the code needs to know, stated once.
 * The other tables here are worked out from it.
 *
 * A curated example is written as tokens. A phrase or clause opens with its start token followed by the code of its coded feature,
 * like '(NPA' for a noun phrase that is an agent, or '[p' for an attributive patient clause. It closes with ')' or ']'.
 * A word is written as its stem.
 */

type FormatFeatureValue = {
	/** What the feature shows when it is displayed, like 'Agent' */
	label: string
	/** The value a source entity has, like 'Most Agent-like'. It is the label unless it says otherwise. */
	source_value?: string
	/** The theta grid argument of a verb that a noun phrase or clause with this value is. `true` when it is the label. */
	theta_argument?: string | true
}

type FormatFeature = {
	name: string
	/** The only feature of its part that is written in the format. Its values are keyed by their code. */
	coded?: true
	/** The code written when the entity has none, because the format has to write something. */
	fallback_code?: string
	/** Not a feature of a source entity: it is worked out from where the entity is in the verse. */
	computed?: true
	/** For the feature of a word: the source categories of the words that have it. */
	words?: PartOfSpeech[]
	/** Only these values are kept. The others are of no use to an example. */
	values: Record<string, FormatFeatureValue>
}

type FormatPart = {
	kind: 'phrase' | 'clause' | 'word'
	/** For a phrase or clause: its start token */
	start?: string
	/** For a phrase or clause: what it shows as, which is the category_abbr of the entity */
	abbr?: string
	/** For a phrase: the part of speech of its head word */
	head?: PartOfSpeech
	features?: Record<string, FormatFeature>
}

/** The parts are named for the category of the source entity that opens a phrase or clause. A word has a category of its own: its part of speech. */
export type BoundaryPartName = 'Noun Phrase' | 'Verb Phrase' | 'Adjective Phrase' | 'Adverb Phrase' | 'Clause'
export type FormatPartName = BoundaryPartName | 'Word'

export const curated_example_format: Record<FormatPartName, FormatPart> = {
	'Noun Phrase': {
		kind: 'phrase',
		start: '(NP',
		abbr: 'NP',
		head: 'Noun',
		features: {
			semantic_role: {
				name: 'Semantic Role',
				coded: true,
				fallback_code: 'N',
				values: {
					A: { label: 'Agent', source_value: 'Most Agent-like', theta_argument: 'Agent-like' },
					P: { label: 'Patient', source_value: 'Most Patient-like', theta_argument: 'Patient-like' },
					d: { label: 'Destination', theta_argument: true },
					s: { label: 'Source', theta_argument: true },
					S: { label: 'State', theta_argument: true },
					I: { label: 'Instrument', theta_argument: true },
					B: { label: 'Beneficiary', theta_argument: true },
					D: { label: 'Addressee' },
				},
			},
		},
	},
	'Verb Phrase': { kind: 'phrase', start: '(VP', abbr: 'VP', head: 'Verb' },
	'Adjective Phrase': {
		kind: 'phrase',
		start: '(AP',
		abbr: 'AdjP',
		head: 'Adjective',
		features: {
			usage: {
				name: 'Usage',
				coded: true,
				values: {
					A: { label: 'Attributive' },
					P: { label: 'Predicative' },
				},
			},
		},
	},
	'Adverb Phrase': { kind: 'phrase', start: '(aP', abbr: 'AdvP', head: 'Adverb' },
	'Clause': {
		kind: 'clause',
		start: '[',
		// for 'Proposition' - verb clause arguments are called 'Patient/Agent Propositions'
		abbr: 'Prop',
		features: {
			type: {
				name: 'Type',
				coded: true,
				values: {
					A: { label: 'Agent', source_value: 'Agent (Subject Complement)', theta_argument: 'Agent proposition' },
					P: { label: 'Patient', source_value: 'Patient (Object Complement)', theta_argument: 'Patient proposition' },
					p: { label: 'Patient', source_value: 'Attributive Patient (Adjectival Object Complement)' },
				},
			},
			// The argument clause of an adjective is the same participant as the clause the adjective is in, or a different one.
			participant: {
				name: 'Participant',
				computed: true,
				values: {
					same: { label: 'Same' },
					different: { label: 'Different' },
				},
			},
		},
	},
	'Word': {
		kind: 'word',
		features: {
			// Whether an adjective is comparative is all that its degree is needed for.
			degree: {
				name: 'Degree',
				words: ['Adjective'],
				values: {
					comparative: { label: 'Comparative' },
					intensified_comparative: { label: 'Intensified Comparative' },
				},
			},
		},
	},
}

/** A phrase and a clause each have their own brackets, which the entity holds as its value, however its start token is written. */
const brackets = {
	phrase: { open: '(', close: ')' },
	clause: { open: '[', close: ']' },
}

//===============
// Worked out from the format

type BoundaryPart = FormatPart & { kind: 'phrase' | 'clause'; start: string; abbr: string }

const boundary_entries = (Object.entries(curated_example_format) as [FormatPartName, FormatPart][])
	.filter((entry): entry is [BoundaryPartName, BoundaryPart] => entry[1].kind !== 'word')

const get_part = (name: string): FormatPart | undefined => curated_example_format[name as FormatPartName]

const find_coded_feature = (part: FormatPart | undefined): FormatFeature | undefined =>
	Object.values(part?.features ?? {}).find(({ coded }) => coded)

function get_feature({ part_name, feature_key }: { part_name: FormatPartName; feature_key: string }): FormatFeature {
	const feature = curated_example_format[part_name].features?.[feature_key]
	if (!feature) throw new Error(`The curated example format has no ${feature_key} feature for ${part_name}.`)
	return feature
}

/** The value a source entity has for a feature value */
export const get_source_value = ({ label, source_value }: FormatFeatureValue): string => source_value ?? label

/** The category of the entities that open a phrase or clause */
export const BOUNDARY_CATEGORIES = new Set<string>(boundary_entries.map(([name]) => name))

/** The closing bracket of each opening bracket */
export const closing_bracket_by_opening: Record<string, string> = Object.fromEntries(Object.values(brackets).map(({ open, close }) => [open, close]))
const CLOSING_BRACKETS = new Set(Object.values(closing_bracket_by_opening))

export const is_boundary_start = ({ value }: { value: string }): boolean => value in closing_bracket_by_opening
export const is_boundary_end = ({ value }: { value: string }): boolean => CLOSING_BRACKETS.has(value)

/** The token that writes the start of each phrase and clause, and what each shows as */
export const start_token_by_category: Record<string, string> = Object.fromEntries(boundary_entries.map(([name, { start }]) => [name, start]))

export const fallback_code_by_category: Record<string, string> = Object.fromEntries(
	boundary_entries.flatMap(([name, part]) => {
		const fallback_code = find_coded_feature(part)?.fallback_code
		return fallback_code ? [[name, fallback_code]] : []
	}),
)

/** The phrase that each part of speech heads */
export const head_phrase_by_part_of_speech: Partial<Record<PartOfSpeech, string>> = Object.fromEntries(
	boundary_entries.flatMap(([name, { head }]) => head ? [[head, name]] : []),
)

/** The theta grid argument of a verb that a noun phrase or clause with this code is */
export function find_theta_argument({ category, code }: { category: string; code: string }): string | undefined {
	const value = find_coded_feature(get_part(category))?.values[code]
	return value?.theta_argument === true ? value.label : value?.theta_argument
}

export const CLAUSE_TYPE = get_feature({ part_name: 'Clause', feature_key: 'type' })
/** The types of clause that are an argument of a verb or an adjective */
export const ARGUMENT_CLAUSE_SOURCE_VALUES = new Set(Object.values(CLAUSE_TYPE.values).map(get_source_value))

export const SEMANTIC_ROLE = get_feature({ part_name: 'Noun Phrase', feature_key: 'semantic_role' })

//===============
// Making entities, and reading them from tokens

const empty_entity: CuratedExampleEntity = { category: '', category_abbr: '', value: '', feature_codes: '', features: [] }

/** Makes the entity for a token. A token that is not the start or end of a phrase or clause is a word, which has no category, since the token does not say. */
export function decode_token(token: string): CuratedExampleEntity {
	if (CLOSING_BRACKETS.has(token)) return { ...empty_entity, value: token }

	const boundary = boundary_entries.find(([, { start }]) => token.startsWith(start))
	if (!boundary) return { ...empty_entity, value: token }

	const [category, part] = boundary
	const feature_code = token.slice(part.start.length)
	const feature = find_coded_feature(part)
	const value = feature?.values[feature_code]
	return {
		category,
		category_abbr: part.abbr,
		value: part.start[0],
		feature_codes: feature_code,
		features: feature && value ? [{ name: feature.name, value: get_source_value(value) }] : [],
	}
}

type MakeBoundaryStartOptions = {
	part_name: BoundaryPartName
	feature_code: string
	features: EntityFeature[]
}

export function make_boundary_start({ part_name, feature_code, features }: MakeBoundaryStartOptions): CuratedExampleEntity {
	const { kind, abbr = '' } = curated_example_format[part_name]
	return { category: part_name, category_abbr: abbr, value: brackets[kind as 'phrase' | 'clause'].open, feature_codes: feature_code, features }
}

export const make_boundary_end = (start: CuratedExampleEntity): CuratedExampleEntity => ({ ...empty_entity, value: closing_bracket_by_opening[start.value] })

export const make_word = ({ category, value, features }: Pick<CuratedExampleEntity, 'category' | 'value' | 'features'>): CuratedExampleEntity => ({ ...empty_entity, category, value, features })

type ReadSourceFeaturesOptions = {
	part_name: FormatPartName
	/** The category and features of the source entity */
	source_category: string
	source_features: EntityFeature[]
}

/**
 * The features of a source entity that are of use to an example, which are only those that have a value the format knows,
 * along with the code of the coded one.
 */
export function read_source_features({ part_name, source_category, source_features }: ReadSourceFeaturesOptions): { features: EntityFeature[]; feature_code: string } {
	const found = Object.values(curated_example_format[part_name].features ?? {}).flatMap(feature => {
		if (feature.computed) return []
		if (feature.words && !feature.words.includes(source_category as PartOfSpeech)) return []

		const source_value = source_features.find(({ name }) => name === feature.name)?.value
		const entry = Object.entries(feature.values).find(([, value]) => get_source_value(value) === source_value)
		return entry && source_value ? [{ feature: { name: feature.name, value: source_value }, code: feature.coded ? entry[0] : '' }] : []
	})

	return { features: found.map(({ feature }) => feature), feature_code: found.map(({ code }) => code).join('') }
}

//===============
// The features that are worked out, for the code that works them out and reads them

const PARTICIPANT = get_feature({ part_name: 'Clause', feature_key: 'participant' })

export function make_participant_feature(participant: 'same' | 'different'): EntityFeature {
	return { name: PARTICIPANT.name, value: PARTICIPANT.values[participant].label }
}

//===============
// How an entity is displayed

/** What a phrase or clause shows its coded feature as, like 'Agent' */
export function get_coded_feature_label({ category, features }: CuratedExampleEntity): string | undefined {
	const feature = find_coded_feature(get_part(category))
	const source_value = features.find(({ name }) => name === feature?.name)?.value
	return Object.values(feature?.values ?? {}).find(value => get_source_value(value) === source_value)?.label
}

//===============
// A concept keeps its curated examples as one text, with a line for each example.

export const split_example_lines = (curated_examples: string): string[] => curated_examples.split(/\r?\n/).filter(line => line !== '')

type PutExampleOptions = {
	curated_examples: string
	encoded_example: string
	/** The index of the existing example that this one replaces, if it replaces one */
	replaces: number | null
}

/** The curated examples with the example added, or in the place of the one it replaces. */
export function put_example({ curated_examples, encoded_example, replaces }: PutExampleOptions): string {
	const lines = split_example_lines(curated_examples)
	const is_replacing = replaces !== null && replaces < lines.length
	const put_lines = is_replacing ? lines.map((line, index) => index === replaces ? encoded_example : line) : [...lines, encoded_example]
	return put_lines.join('\n') + '\n'
}

/** Whether the concept already has the example, not counting the one that it replaces. */
export function is_duplicate_example({ curated_examples, encoded_example, replaces }: PutExampleOptions): boolean {
	return split_example_lines(curated_examples).some((line, index) => index !== replaces && line === encoded_example)
}
