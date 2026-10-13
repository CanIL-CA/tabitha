import { get_book_status, get_chapter_statuses_for_book } from '#lib/data/status.js'
import type { PageServerLoad } from './$types'

export async function load({ locals: { db }, params: { type, id_primary } }: Parameters<PageServerLoad>[0]) {
	const reference = { type, id_primary }

	const primary_id_status = await get_book_status({ db, reference })
	const secondary_id_statuses = await get_chapter_statuses_for_book({ db, reference })

	return {
		primary_id_status,
		secondary_id_statuses,
	}
}
