import type { ContextArgumentName } from '@tabitha/types'

type Descriptions = Record<ContextArgumentName, string>

// How each context argument is derived lives in tools/databases/migrations/ontology/exhaustive_examples/example_context.ts.
// The same name can mean different things on different parts of speech (Verb, Agent, Degree), so descriptions are per part of speech.

const COMPLEX_AND_PAIRING: Descriptions = {
	'Complex Handling': 'How a complex word is handled in this example: used on its own (None), inside a complex alternate, as the complex half of a pairing, or as an explication.',
	'Pairing': 'The word this one is paired with in the example, such as a simple/complex pairing or a dynamic\\literal pairing.',
}

const DESCRIPTIONS_BY_PART_OF_SPEECH: Record<string, Descriptions> = {
	Noun: {
		...COMPLEX_AND_PAIRING,
		'Role': 'The semantic role of this noun phrase in its clause (Agent, Patient, ...). "No Role" when the noun phrase is inside another phrase rather than directly in the clause.',
		'Verb': "The verb of the clause this noun phrase belongs to. Only set when the noun phrase isn't inside another phrase.",
		'Adposition': 'The adposition (preposition or postposition) that comes directly before the noun in its phrase.',
		'Outer Noun': `The head noun of the noun phrase that contains this noun's phrase, e.g. "king" for Israel in "the king of Israel".`,
		'Outer Adjective': "The head adjective of the adjective phrase that contains this noun's phrase.",
		'Outer Adverb': "The head adverb of the adverb phrase that contains this noun's phrase.",
	},
	Verb: {
		...COMPLEX_AND_PAIRING,
		'Agent': "The head noun of the noun phrase with the Agent role in this verb's clause.",
		'Patient': "The head noun of the noun phrase with the Patient role in this verb's clause.",
		'State': "The head noun of the noun phrase with the State role in this verb's clause.",
		'Source': "The head noun of the noun phrase with the Source role in this verb's clause.",
		'Destination': "The head noun of the noun phrase with the Destination role in this verb's clause.",
		'Instrument': "The head noun of the noun phrase with the Instrument role in this verb's clause.",
		'Beneficiary': "The head noun of the noun phrase with the Beneficiary role in this verb's clause.",
		'Predicate Adjective': `The head adjective of a predicative adjective phrase in this verb's clause, e.g. "good" in "The land is good".`,
		'Propositional Agent': 'The verb of a clause that acts as the Agent of this verb, shown in brackets.',
		'Propositional Patient': 'The verb of a clause that acts as the Patient of this verb, shown in brackets, e.g. "[go]" in "He told them [to go]".',
		'Topic NP': 'Which noun phrase is the topic of the clause, e.g. the Most Agent-like or the Most Patient-like one.',
		'Polarity': 'Whether the verb is affirmative or negative.',
	},
	Adjective: {
		...COMPLEX_AND_PAIRING,
		'Usage': 'Attributive (the adjective sits inside a noun phrase and modifies that noun) or Predicative (the adjective describes the clause subject, as in "The land is good").',
		'Agent': 'Predicative adjectives only: the head noun of the Agent noun phrase in the clause, which is the noun the adjective describes, e.g. "land" in "The land is good".',
		'Verb': 'Predicative adjectives only: the verb of the clause, e.g. "be" in "The land is good".',
		'Modified Noun': 'Attributive adjectives only: the noun this adjective modifies inside its noun phrase, e.g. "land" in "the good land". It is not set for predicative adjectives; use Agent for the noun they describe.',
		'Modified Adjective': "The head adjective of the adjective phrase that contains this adjective's phrase.",
		'Patient Noun': 'The head noun of a noun phrase the adjective takes as its object, e.g. "Mary" in "kind to Mary".',
		'Patient Clause': 'The verb of a clause the adjective takes as its complement, shown in brackets, e.g. "[go]" in "able [to go]".',
		'Degree': 'The degree of the adjective, such as comparative or "too".',
	},
	Adverb: {
		...COMPLEX_AND_PAIRING,
		'Verb': "The verb of the clause this adverb relates to. Only set when the adverb phrase isn't inside another phrase.",
		'Modified Noun': 'The head noun of the noun phrase this adverb phrase is inside.',
		'Modified Adjective': 'The head adjective of the adjective phrase this adverb phrase is inside.',
		'Degree': 'The degree of the adverb, such as comparative or intensified.',
	},
	Adposition: {
		'Noun': 'The head noun of the phrase this adposition is in.',
		'Verb': 'The head verb of the phrase this adposition is in.',
		'Adjective': 'The head adjective of the phrase this adposition is in.',
		'Outer Noun': "The head noun of the noun phrase that contains this adposition's phrase.",
		'Outer Adjective': "The head adjective of the adjective phrase that contains this adposition's phrase.",
	},
}

export function filter_description({ part_of_speech, name }: {
	part_of_speech: string
	name: ContextArgumentName
}): string | undefined {
	return DESCRIPTIONS_BY_PART_OF_SPEECH[part_of_speech]?.[name]
}
