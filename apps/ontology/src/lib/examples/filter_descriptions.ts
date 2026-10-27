import type { ContextArgumentName } from '@tabitha/types'

type Descriptions = Record<ContextArgumentName, string>

// How each context argument is derived lives in tools/databases/migrations/ontology/exhaustive_examples/example_context.ts.
// The same name can mean different things on different parts of speech (Verb, Agent, Degree), so descriptions are per part of speech.

const COMPLEX_AND_PAIRING: Descriptions = {
	'Complex Handling': 'How a complex word is handled in the example: used on its own (None), inside a complex alternate, in a pairing, or as an explication.',
	'Pairing': 'The word this one is paired with in the example, such as a simple/complex pairing or a dynamic\\literal pairing.',
}

const DESCRIPTIONS_BY_PART_OF_SPEECH: Record<string, Descriptions> = {
	Noun: {
		...COMPLEX_AND_PAIRING,
		'Role': 'The semantic role of the noun phrase in its clause (Agent, Patient, ...). "No Role" when inside another phrase rather than directly in the clause.',
		'Verb': "The verb of the clause the noun phrase belongs to. Only set when the noun phrase isn't inside another phrase.",
		'Adposition': 'The adposition that that comes directly before the noun in its phrase.',
		'Outer Noun': `The noun of the noun phrase that contains this noun's phrase. Mostly for various genitives, e.g. "king" for Israel in "the king of Israel".`,
		'Outer Adjective': `The adjective of the adjective phrase that contains this noun's phrase. For comparatives ("kinder than Mary") or adjective arguments ("kind to Mary").`,
		'Outer Adverb': `The adverb of the adverb phrase that contains this noun's phrase. Mostly for comparatives, e.g. "wisely" for Peter in "John ruled more wisely than Peter".`,
	},
	Verb: {
		...COMPLEX_AND_PAIRING,
		'Agent': "The first Agent noun in the verb's clause.",
		'Patient': "The first Patient noun in the verb's clause.",
		'State': "The first State noun in the verb's clause.",
		'Source': "The first Source noun in the verb's clause.",
		'Destination': "The first Destination noun in the verb's clause.",
		'Instrument': "The first Instrument noun in the verb's clause.",
		'Beneficiary': "The first Beneficiary noun in the verb's clause.",
		'Predicate Adjective': `The first predicate adjective in the verb's clause, e.g. "good" in "The land is good".`,
		'Propositional Agent': 'The verb of a clause that acts as the Agent of the verb, shown in brackets.',
		'Propositional Patient': 'The verb of a clause that acts as the Patient of the verb, shown in brackets, e.g. "[go]" in "He told them [to go]".',
		'Topic NP': 'Which noun phrase is the topic of the clause, related to "voice", e.g. the Most Agent-like (active) or the Most Patient-like (passive) one.',
		'Polarity': 'Whether the verb is affirmative or negative.',
	},
	Adjective: {
		...COMPLEX_AND_PAIRING,
		'Usage': 'Attributive (e.g. "the good land") or Predicative (e.g. "the land is good").',
		'Agent': 'Predicative adjectives only: the Agent noun in the clause, which is the noun the adjective describes, e.g. "land" in "The land is good".',
		'Verb': 'Predicative adjectives only: the verb of the clause, e.g. "be" in "The land is good".',
		'Modified Noun': 'Attributive adjectives only: the noun this adjective modifies inside its noun phrase, e.g. "land" in "the good land". It is not set for predicative adjectives; use Agent for the noun they describe.',
		'Modified Adjective': "The head adjective of the adjective phrase that contains this adjective's phrase.",
		'Patient Noun': 'The noun that the adjective takes as its object, e.g. "Mary" in "kind to Mary".',
		'Patient Clause': 'The verb of a clause the adjective takes as its complement, shown in brackets, e.g. "[go]" in "able [to go]".',
		'Degree': 'The degree of the adjective, such as comparative or "too".',
	},
	Adverb: {
		...COMPLEX_AND_PAIRING,
		'Verb': "The verb of the clause this adverb relates to. Only set when the adverb phrase isn't inside another phrase.",
		'Modified Noun': 'The head noun of the noun phrase the adverb phrase is inside.',
		'Modified Adjective': "The head adjective of the adjective phrase this adverb's phrase is inside.",
		'Degree': 'The degree of the adverb, such as comparative or intensified.',
	},
	Adposition: {
		'Noun': 'The head noun of the phrase this adposition is directly in.',
		'Verb': 'The verb of the clause this adposition is in.',
		'Adjective': 'The head adjective of the phrase this adposition is in.',
		'Outer Noun': 'The head noun of the noun phrase that directly contains the phrase that the adposition is in. Mostly for genitives, e.g. "king" in "the king of Israel".',
		'Outer Adjective': 'The head adjective of the adjective phrase that directly contains the phrase that the adposition is in.',
	},
}

export function filter_description({ part_of_speech, name }: {
	part_of_speech: string
	name: ContextArgumentName
}): string | undefined {
	return DESCRIPTIONS_BY_PART_OF_SPEECH[part_of_speech]?.[name]
}
