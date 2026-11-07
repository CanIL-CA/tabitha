import { bible_book_number } from '#lib/generation/generator.js'
import type { DbSource } from '#lib/types.js'

// Everything the engine needs to generate one verse, apart from the audience.
export type GenerationJob = {
	book: number
	chapter: number
	verse: number
	encoding: string
	previous_encoding: string
}

export type VerseGeneration = { job: GenerationJob } | { error: string }

export function verse_generation({ source, previous_source }: { source: DbSource, previous_source: DbSource | null }): VerseGeneration {
	const book = source.type.toLowerCase() === 'bible' ? bible_book_number(source.id_primary) : undefined
	if (!book) return { error: 'Text generation only supports Bible verses.' }
	if (!source.semantic_encoding) return { error: 'This verse has no encoding yet.' }
	return {
		job: {
			book,
			chapter: Number(source.id_secondary),
			verse: Number(source.id_tertiary),
			encoding: source.semantic_encoding,
			previous_encoding: previous_source?.semantic_encoding ?? '',
		},
	}
}
