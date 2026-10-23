
export type PartOfSpeech =
	| 'Noun'
	| 'Verb'
	| 'Adjective'
	| 'Adverb'
	| 'Adposition'
	| 'Conjunction'
	| 'Particle'
	| 'Phrasal'

export type SourceEntityCategory = PartOfSpeech | 'Noun Phrase' | 'Verb Phrase' | 'Adjective Phrase' | 'Adverb Phrase' | 'Clause' | 'Format Marker' | 'Section' | 'period' | ''

export type ConceptKey = {
	stem: string
	sense: string
	part_of_speech: PartOfSpeech
}

export type SourceStatus =
	| 'Unknown'
	| 'Not Started'
	| 'Initial Analysis in Progress'
	| 'Initial Analysis Complete'
	| 'Final Review in Progress'
	| 'Ready to Translate'
