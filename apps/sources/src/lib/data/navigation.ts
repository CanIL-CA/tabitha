import type { D1DatabaseSession } from '@cloudflare/workers-types'
import { get_primary_ids, get_secondary_ids, get_source_data, get_tertiary_ids } from './read'
import { BIBLE_BOOKS } from '@tabitha/types/patterns'
import type { Book, Reference } from '@tabitha/types'

export async function get_previous_reference({ db, reference }: { db: D1DatabaseSession, reference: Reference }): Promise<Reference | null> {
	// try decrementing id_tertiary
	let previous: Reference = {
		...reference,
		id_tertiary: `${Number(reference.id_tertiary) - 1}`,
	}
	if (previous.id_tertiary !== '0' && await get_source_data({ db, ...previous })) {
		return previous
	}

	// try decrementing id_secondary
	const previous_chapter = `${Number(reference.id_secondary) - 1}`
	if (previous_chapter !== '0') {
		previous = {
			...reference,
			id_secondary: previous_chapter,
			id_tertiary: await get_last_verse({ db, type: reference.type, book_name: reference.id_primary, chapter: previous_chapter }) || '1',
		}
		if (await get_source_data({ db, ...previous })) {
			return previous
		}
	}

	// try decrementing id_primary (by index)
	const primary_order = await get_primary_order({ db, type: reference.type })
	const book_index = find_book_index({ reference, primary_order })
	if (!book_index) {
		return null
	}

	const previous_book = primary_order[book_index - 1]
	if (!previous_book) {
		return null
	}

	const last_chapter = await get_last_chapter({ db, type: reference.type, book_name: previous_book }) || '1'
	const last_verse = await get_last_verse({ db, type: reference.type, book_name: previous_book, chapter: last_chapter }) || '1'
	previous = {
		...reference,
		id_primary: previous_book,
		id_secondary: last_chapter,
		id_tertiary: last_verse,
	}
	return await get_source_data({ db, ...previous }) ? previous : null
}

export async function get_next_reference({ db, reference }: { db: D1DatabaseSession, reference: Reference }): Promise<Reference | null> {
	// try incrementing id_tertiary
	let next: Reference = {
		...reference,
		id_tertiary: `${Number(reference.id_tertiary) + 1}`,
	}
	if (await get_source_data({ db, ...next })) {
		return next
	}

	// try incrementing id_secondary
	next = {
		...reference,
		id_secondary: `${Number(reference.id_secondary) + 1}`,
		id_tertiary: '1',
	}
	if (await get_source_data({ db, ...next })) {
		return next
	}

	// try incrementing id_primary (by index)
	const primary_order = await get_primary_order({ db, type: reference.type })
	const book_index = find_book_index({ reference, primary_order })
	if (!book_index) {
		return null
	}

	const next_book = primary_order[book_index + 1]
	if (!next_book) {
		return null
	}

	next = {
		...reference,
		id_primary: next_book,
		id_secondary: '1',
		id_tertiary: '1',
	}
	return await get_source_data({ db, ...next }) ? next : null
}

/**
 * The canonical ordering of primary ids (eg. book names) for a reference's type, keyed
 * from 1 like `BIBLE_BOOKS`, so `find_book_index` and its callers work the same way for
 * every type. `Bible` references use the fixed canonical book order; there's no such static
 * order for other types (eg. `Grammar Introduction`), so this falls back to whatever order
 * `get_primary_ids` returns them in.
 */
async function get_primary_order({ db, type }: { db: D1DatabaseSession, type: string }): Promise<Book> {
	if (type === 'Bible') {
		return BIBLE_BOOKS
	}

	const primary_ids = await get_primary_ids({ db, type })
	return Object.fromEntries(primary_ids.map(({ id_primary }, index) => [index + 1, id_primary]))
}

function find_book_index({ reference, primary_order }: { reference: Reference, primary_order: Book }): number | undefined {
	const upper_book_name = reference.id_primary.toUpperCase()
	const index_string = Object.entries(primary_order).find(([, name]) => name.toUpperCase() === upper_book_name)?.[0]
	return index_string ? Number(index_string) : undefined
}

async function get_last_chapter({ db, type, book_name }: { db: D1DatabaseSession, type: string, book_name: string }): Promise<string | null> {
	const secondary_ids = await get_secondary_ids({ db, type, id_primary: book_name })
	if (secondary_ids.length === 0) {
		return null
	}
	return Math.max(...secondary_ids.map(({ id_secondary }) => Number(id_secondary))).toString()
}

async function get_last_verse({ db, type, book_name, chapter }: { db: D1DatabaseSession, type: string, book_name: string, chapter: string }): Promise<string | null> {
	const tertiary_ids = await get_tertiary_ids({ db, type, id_primary: book_name, id_secondary: chapter })
	if (tertiary_ids.length === 0) {
		return null
	}
	return Math.max(...tertiary_ids.map(({ id_tertiary }) => Number(id_tertiary))).toString()
}
