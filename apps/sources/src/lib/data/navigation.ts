import type { D1DatabaseSession } from '@cloudflare/workers-types'
import { get_primary_ids, get_secondary_ids, get_source_data, get_tertiary_ids } from './read'
import { primary_id_orders } from './lookups'
import type { Book, PrimaryId, Reference } from '@tabitha/types'
import type { NavData } from '#lib/types.ts'

export async function get_nav_data({ db, reference }: { db: D1DatabaseSession, reference: Reference }): Promise<NavData | undefined> {
	const source = await get_source_data({ db, ...reference })
	if (!source) return undefined

	reference.id_primary = source.id_primary	// get the proper capitalization

	const previous = await get_previous_reference({ db, reference })
	const next = await get_next_reference({ db, reference })

	return { previous, current: reference, next }
}

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
	const fixed_order = primary_id_orders[type]
	if (fixed_order) {
		return fixed_order
	}

	const primary_ids = await get_primary_ids({ db, type })
	return Object.fromEntries(primary_ids.map(({ id_primary }, index) => [index + 1, id_primary]))
}

/**
 * The primary ids that actually have data for a type, in `get_primary_order`'s order. Ids the
 * order doesn't know about sort last, in the order `get_primary_ids` returned them.
 */
export async function get_primary_ids_in_order({ db, type }: { db: D1DatabaseSession, type: string }): Promise<PrimaryId[]> {
	const [primary_ids, primary_order] = await Promise.all([
		get_primary_ids({ db, type }),
		get_primary_order({ db, type }),
	])
	const ordered_names = Object.values(primary_order).map(name => name.toUpperCase())
	const rank = ({ id_primary }: PrimaryId) => {
		const index = ordered_names.indexOf(id_primary.toUpperCase())
		return index === -1 ? ordered_names.length : index
	}
	return primary_ids.toSorted((a, b) => rank(a) - rank(b))
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
