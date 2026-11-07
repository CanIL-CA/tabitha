import type { Book, SourceStatus } from '@tabitha/types'
import { BIBLE_BOOKS } from '@tabitha/types/patterns'

/** The fixed order of primary ids (keyed from 1) for the types that have one. */
export const primary_id_orders: Record<string, Book> = {
	Bible: BIBLE_BOOKS,
}

/** Named inclusive ranges of a type's `primary_id_orders` positions, for the types that group their primary ids. */
export const primary_id_groupings: Record<string, Record<string, [number, number]>> = {
	Bible: {
		'Old Testament': [1, 39],
		'New Testament': [40, 66],
	},
}

export const status_list: SourceStatus[] = ['Not Started', 'Initial Analysis in Progress', 'Initial Analysis Complete', 'Final Review in Progress', 'Ready to Translate']
