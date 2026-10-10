import { get_book_status } from '#lib/data/status.js'
import { cached_json } from '@tabitha/api-client'
import type { RequestHandler } from './$types'

export async function GET({ locals: { db }, params: { type, id_primary } }: Parameters<RequestHandler>[0]) {
	const result = await get_book_status({ db, reference: { type, id_primary } })

	return cached_json({ data: result })
}
