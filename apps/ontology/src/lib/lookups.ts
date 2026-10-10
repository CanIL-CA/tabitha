import { BIBLE_BOOKS } from '@tabitha/types/patterns'
import type { Book, PartOfSpeech } from '@tabitha/types'

// Verb categorizations in the database '[Aa_][Bb_][Cc_][Dd_][Ee_][Ff_][Gg_][Hh_][Ii_]'
// DisplayOntologyDlg.cppL1010
//
// The letters are irrelevant, the position and case are what matters:
//		| position 	| meaning 						|
//		| -------- 	| -------------------------|
//		| 0 (Aa)		| Agent-like 					|
//		| 1 (Bb)		| Patient-like 				|
//		| 2 (Cc)		| State 							|
//		| 3 (Dd)		| Source 						|
//		| 4 (Ee)		| Destination 					|
//		| 5 (Ff)		| Instrument 					|
//		| 6 (Gg)		| Beneficiary 					|
//		| 7 (Hh)		| Patient proposition 		|
//		| 8 (Ii)		| Agent proposition	|
//
// Uppercase means required, lowercase means optional and an underscore('_') in any position means not applicable.
const required: Record<string, string> = {
	A: 'Agent-like',
	B: 'Patient-like',
	C: 'State',
	D: 'Source',
	E: 'Destination',
	F: 'Instrument',
	G: 'Beneficiary',
	H: 'Patient proposition',
	I: 'Agent proposition',
}

const optional: Record<string, string> = Object.entries(required).reduce<Record<string, string>>((opt, entry) => lowercase_and_parens({ opt, entry }), {})

/**
 * Creates an object holding lowercase keys and parenthesized values:
 * e.g., `{ a: '(Agent-like)', b: '(Patient-like)', ... }`
 */
function lowercase_and_parens({ opt, entry: [key, value] }: {
	opt: Record<string, string>
	entry: [string, string]
}): Record<string, string> {
	opt[key.toLowerCase()] = `(${value})`
	return opt
}

export const theta_grid: Record<string, string> = {
	...required,
	...optional,
	_: '',
}

export const theta_grid_arguments: string[] = Object.values(required)

export const semantic_category: Partial<Record<PartOfSpeech, Record<string, string>>> = {
	// Adjective categorizations
	// DisplayOntologyDlg.cppL1064
	//
	// [Aa_][Bb_][Cc_][Dd_][Ee_][Ff_]
	//
	// 	| position 	| usage info 																		|
	//		| ---------	| ---------------------------------------------------------------	|
	//		| 2			| used attributively 															|
	//		| 3			| used predicately without an argument 									|
	//		| 4			| used predicately with a nominal argument 								|
	//		| 5			| used predicately with a same participant clausal argument 		|
	//		| 6			| used predicately with a different participant clausal argument 	|
	//		| 7			| used comparatively 															|
	//
	//		| case		| when		|
	//		| ---------	| ---------	|
	//		| upper		| always		|
	//		| lower		| sometimes	|
	//		| _			| never		|
	Adjective: {
		G: 'Generic',
		C: 'Cardinal number',
		O: 'Ordinal number',
		F: 'Fractional number',
		Q: 'Quantity',
		I: 'Identity',
		L: 'Color',
	},
	// Noun categorizations
	// TBTA -> (ontology) -> (nouns) -> Concept Subsets button
	// SemanticDomainNamesDlg.cpp::LoadConceptCategories (comment on line ~504)
	// Ontology.mdb:Features_Source.FeatureValues
	//
	// | letter | meaning 				|
	// | ------ | ------------------ |
	// | A 		| Abstracts 			|
	// | F 		| Feminine names 		|
	// | G 		| Geographical names |
	// | M 		| Masculine names 	|
	// | O 		| Ordinal numbers 	|
	// | T 		| Temporal names 		|
	// | g 		| Other proper names |
	// | o 		| All other objects 	|
	Noun: {
		A: 'Abstracts',
		F: 'Feminine names',
		G: 'Geographical names',
		M: 'Masculine names',
		O: 'Ordinal numbers',
		T: 'Temporal names',
		g: 'Other proper names',
		o: 'All other objects',
	},
}

export const usage_info: Partial<Record<PartOfSpeech, string[]>> = {
	Adjective: [
		'used attributively',
		'used predicatively without an argument',
		'used predicatively with a nominal argument',
		'used predicatively with a same participant clausal argument',
		'used predicatively with a different participant clausal argument',
		'used comparatively',
	],
	Adposition: [
		'used in Adjunct Phrases',
		'used in Noun-Noun Phrases',
		'used in Abverbial Clauses',
	],
	Adverb: [
		'used in Clauses to modify Verbs',
		'used in Noun Phrases',
		'used in Adjective Phrases',
	],
	Conjunction: [
		'used to conjoin Clauses',
		'used to conjoin Noun Phrases',
		'used to conjoin Adjective Phrases',
		'used to conjoin Adverb Phrases',
	],
}

export const default_categories: Partial<Record<PartOfSpeech, string[]>> = {
	Verb: [
		'Agent-like',
		...new Array(theta_grid_arguments.length - 1).fill(''),
	],
	Noun: ['All other objects'],
	Adjective: [
		'Generic',
		...usage_info.Adjective?.map(v => `never ${v}`) ?? [],
	],
	Adposition: usage_info.Adposition?.map(v => `never ${v}`) ?? [],
	Adverb: usage_info.Adverb?.map(v => `never ${v}`) ?? [],
	Conjunction: usage_info.Conjunction?.map(v => `never ${v}`) ?? [],
}

/**
 * ReferenceUtils.cpp CReferenceUtils::GetBookNumber
 */
const grammar_introduction_books: Book = {
	1: 'Nouns',
	2: 'Verbs',
	3: 'Adjectives',
	4: 'Adverbs',
	5: 'Adpositions',
	6: 'Pronouns',
	7: 'Noun_Phrases',
	8: 'Clauses',
	9: 'Discourse',
	10: 'Theta_Grids',
}

/**
 * ReferenceUtils.cpp CReferenceUtils::GetBookNumber
 */
const community_development_text_books: Book = {
	1: 'Infected Eye',
	2: "Kande's Story",
	3: 'Avian Influenza',
}

/**
 * Map lookup for the source and book of a reference.
 *
 * As of Nov 2023, the Ontology data looked like this:
 * | source | count 	|
 * |--------|--------|
 * |	3		|	6		| "Missions Documents"
 * |	4		|	1087	| "Bible"
 * |	6		|	57		| "Grammar Introduction"
 * |	7		|	75		| "Community Development Texts"
 *
 * ReferenceUtils.cpp CReferenceUtils::GetSourceTextName
 */
export const sources = new Map<string, Book>([
	['Hebrew Old Testament', {}],
	['Greek New Testament', {}],
	['Greek Grammar Introduction', {}],
	['Missions Documents', {}],
	['Bible', BIBLE_BOOKS],
	['Video Subtitles', {}],
	['Grammar Introduction', grammar_introduction_books],
	['Community Development Texts', community_development_text_books],
])

export const levels = new Map<string, string>([
	['0', 'Semantic Primitive'],
	['1', 'Semantic Molecule'],
	['2', 'Complex - usually explicated'],
	['3', 'Complex - usually in a complex alternate'],
	['4', 'Inexplicable'],
])

export const parts_of_speech: PartOfSpeech[] = ['Noun', 'Verb', 'Adjective', 'Adverb', 'Adposition', 'Conjunction', 'Particle', 'Phrasal']

export const curated_example_category_codes: Record<string, string> = {
	'(NP': 'NP',
	'(VP': 'VP',
	'(AP': 'AdjP',
	'(aP': 'AdvP',
	'[': 'Clause',
	')': 'Phrase end',
	']': 'Clause end',
}

export const curated_example_feature_codes: Record<string, Record<string, string>> = {
	'NP': {
		'A': 'Agent',
		'P': 'Patient',
		'd': 'Destination',
		's': 'Source',
		'S': 'State',
		'I': 'Instrument',
		'B': 'Beneficiary',
		'D': 'Addressee',
	},
	'AdjP': {
		'A': 'Attributive',
		'P': 'Predicative',
	},
	'Clause': {
		'A': 'Agent',
		'P': 'Patient',
	},
}
