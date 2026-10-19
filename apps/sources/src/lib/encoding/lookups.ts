import type { EncodingEntityCategory } from '@tabitha/types'

export const CATEGORY_NAME_LOOKUP = new Map<string, EncodingEntityCategory>([
	['N', 'Noun'],
	['V', 'Verb'],
	['A', 'Adjective'],
	['a', 'Adverb'],
	['P', 'Adposition'],
	['C', 'Conjunction'],
	['p', 'Phrasal'],
	['r', 'Particle'],
	['n', 'Noun Phrase'],
	['v', 'Verb Phrase'],
	['j', 'Adjective Phrase'],
	['d', 'Adverb Phrase'],
	['c', 'Clause'],
	['R', 'Format Marker'],
	['E', 'Section'],
	['.', 'period'],
])

export const CATEGORY_ABBREVIATIONS = new Map<EncodingEntityCategory, string>([
	['Noun', 'N'],
	['Verb', 'V'],
	['Adjective', 'Adj'],
	['Adverb', 'Adv'],
	['Adposition', 'Adp'],
	['Conjunction', 'Con'],
	['Phrasal', 'Phr'],
	['Particle', 'Par'],
	['Noun Phrase', 'NP'],
	['Verb Phrase', 'VP'],
	['Adjective Phrase', 'AdjP'],
	['Adverb Phrase', 'AdvP'],
	['Clause', 'C'],
	['Format Marker', 'Fmt'],
	['Section', 'E'],
	['period', 'period'],
])

export const WORD_ENTITY_CATEGORIES = new Set<EncodingEntityCategory>(['Noun', 'Verb', 'Adjective', 'Adverb', 'Adposition', 'Conjunction', 'Phrasal', 'Particle'])

export const GRAMMAR_ONLY_FEATURES = [
	'Verb-Adjective Degree',
	'Verb-Target Tense & Form',
	'Noun Phrase-Thing-Thing Relationship',
	'Noun Phrase-Relativized',
	'Noun Phrase-Specific Phrase Structure Rule Code 1',
	'Verb Phrase-Specific Phrase Structure Rule Code 1',
	'Adjective Phrase-Specific Phrase Structure Rule Code 1',
	'Adverb Phrase-Specific Phrase Structure Rule Code 1',
	'Clause-Speech Style',
	'Clause-Notional Structure Schema',
	'Clause-Specific Phrase Structure Rule Code 1',
	'Clause-Specific Phrase Structure Rule Code 2',
]