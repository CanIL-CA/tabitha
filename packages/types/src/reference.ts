export type Reference = {
	type: string
	id_primary: string
	id_secondary: string
	id_tertiary: string
}

export type SecondaryIdReference = Pick<Reference, 'type' | 'id_primary' | 'id_secondary'>

export type PrimaryIdReference = Pick<Reference, 'type' | 'id_primary'>

// For some things that are Bible-specific (eg. the Copilot), it's nicer to use book/chapter/verse
// rather than the more general id_primary/id_secondary/id_tertiary required by sources and targets
export type VerseReference = {
	book: string
	chapter: number
	verse: number
}

export type Book = Record<number, string>

export type PassageReference = {
	book: string
	chapter: number
	verse_start: number
	verse_end?: number
}
