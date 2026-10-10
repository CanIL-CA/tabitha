import { get_all_book_statuses } from '#lib/data/status.js'
import { cached_json } from '@tabitha/api-client'
import type { RequestHandler } from './$types'

export async function GET({ locals: { db }, params: { type } }: Parameters<RequestHandler>[0]) {
	const results = await get_all_book_statuses({ db, type })

	return cached_json({ data: results })
}
