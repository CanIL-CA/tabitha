import type { CheckerTextInsertion } from '@tabitha/types'
import type { SourceRange } from '#lib/types.js'

type ApplyTextInsertionsResult = {
	text: string
	// in the same order as the given insertions
	inserted_ranges: SourceRange[]
}

export function apply_text_insertions({ text, insertions }: { text: string; insertions: CheckerTextInsertion[] }): ApplyTextInsertionsResult {
	const ordered = insertions.toSorted((a, b) => a.offset - b.offset)
	const { pieces, cursor } = ordered.reduce(
		({ pieces, cursor }, { offset, text: inserted }) => ({ pieces: [...pieces, text.slice(cursor, offset), inserted], cursor: offset }),
		{ pieces: [] as string[], cursor: 0 },
	)
	const fixed_text = [...pieces, text.slice(cursor)].join('')

	const inserted_ranges = insertions.map(({ offset, text: inserted }, index) => {
		const earlier_length = insertions
			.filter((other, other_index) => other.offset < offset || other.offset === offset && other_index < index)
			.reduce((total, other) => total + other.text.length, 0)
		const start = offset + earlier_length
		return { start, end: start + inserted.length }
	})

	return { text: fixed_text, inserted_ranges }
}

export function spaced_insertion_text({ text, position }: { text: string; position: 'before' | 'after' }): string {
	const is_word = /^\w/.test(text)
	if (!is_word) return text

	return position === 'after' ? ` ${text}` : `${text} `
}
