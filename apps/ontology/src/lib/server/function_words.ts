import type { Concept } from '#lib/types.js'
import type { ConceptSearchFilter } from '@tabitha/types'

const FUNCTION_WORDS: [string, string][] = [
	['as', "Sometimes sets the Degree feature of an Adjective or Adverb to Equality (eg. 'as good as')"],
	['begin', 'Sets the Aspect feature of a Verb to Inceptive.'],
	['certainly', "Sets the Polarity feature of a Verb to Emphatic Affirmative or Emphatic Negative (when paired with 'not')."],
	['continue', 'Sets the Aspect feature of a Verb to Continuative.'],
	['could', 'Used with so-A. Otherwise, use "be able".'],
	['definitely', 'Sets the Mood feature of a Verb to Definite Potential.'],
	['extremely', 'Sets the Degree feature of an Adjective or Adverb to Extremely Intensified.'],
	['finish', 'Sets the Aspect feature of a Verb to Completive.'],
	['for', 'Sometimes used to indicate a Beneficiary argument of a Verb.'],
	['from', 'Usually indicates a Source argument of a Verb.'],
	['here', "Becomes 'at this place'."],
	['least', "Sets the Degree feature of an Adjective or Adverb to 'least'."],
	['less', "Sets the Degree feature of an Adjective or Adverb to 'less'."],
	['may', "Sets the Mood feature of a Verb to 'may' (permissive)."],
	['might', 'Sometimes used with if-A, and sometimes sets the Mood feature of a Verb to Might Potential.'],
	['more', 'Sets the Degree feature of an Adjective or Adverb to Comparative.'],
	['most', 'Sets the Degree feature of an Adjective or Adverb to Superlative.'],
	['must', 'Sets the Mood feature of a Verb to Must Obligation.'],
	['probably', 'Sets the Mood feature of a Verb to Definite Potential.'],
	['should', 'Sets the Mood feature of a Verb to Should Obligation.'],
	['start', 'Sets the Aspect feature of a Verb to Inceptive.'],
	['stop', 'Sets the Aspect feature of a Verb to Cessative.'],
	['there', "Becomes 'at this place', except when used with be-E."],
	['to', 'Used to indicate a Destination argument of a Verb or the infinitive form of a Verb.'],
	['too', "Sets the Degree feature of an Adjective or Adverb to 'too'."],
	['very', 'Sets the Degree feature of an Adjective or Adverb to Intensified.'],
	['with', 'Sometimes used to indicate an Instrument argument of a Verb.'],
	['would', 'Used with so-C, if-B, or if-C. Otherwise, cannot be used.'],
	['which', 'Indicates an interrogative Noun or a relative clause.'],
]

export function get_function_words(filter: ConceptSearchFilter): Concept[] {
	if (!['all', ''].includes(filter.category) || filter.scope === 'glosses') {
		return []
	}

	const QUERY_REGEX = /^(?<pre_wildcard>[*%#]?)(?<term>.+?)(?<post_wildcard>[*%#]?)$/
	const match = filter.q.match(QUERY_REGEX)
	if (!match?.groups) {
		return []
	}

	const { pre_wildcard, term, post_wildcard } = match.groups
	return FUNCTION_WORDS.filter(get_word_filter({ pre_wildcard, term, post_wildcard })).map(transform_function_word)
}

type GetWordFilterOptions = {
	readonly pre_wildcard: string | undefined
	readonly term: string
	readonly post_wildcard: string | undefined
}

function get_word_filter({ pre_wildcard, term, post_wildcard }: GetWordFilterOptions): (word_and_gloss: [string, string]) => boolean {
	const key = `${pre_wildcard ? 1 : 0}${post_wildcard ? 1 : 0}`
	const lower_term = term.toLowerCase()

	const filterMap: Record<string, (word_and_gloss: [string, string]) => boolean> = {
		'00': ([word]) => word === lower_term,
		'10': ([word]) => word.endsWith(lower_term),
		'01': ([word]) => word.startsWith(lower_term),
		'11': ([word]) => word.includes(lower_term),
	}

	return filterMap[key] || (() => false)
}

function transform_function_word([word, gloss]: [string, string]): Concept {
	return {
		id: `${word}-fw`,
		stem: word,
		sense: '',
		part_of_speech: 'Function Word',
		gloss,
		level: 'FW',
		categorization: '',
		examples: '',
		brief_gloss: '',
		occurrences: 0,
		categories: [],
		curated_examples: [],
		curated_examples_raw: '',
		status: 'function_word',
		how_to_hints: [],
		pending_changes: [],
	}
}