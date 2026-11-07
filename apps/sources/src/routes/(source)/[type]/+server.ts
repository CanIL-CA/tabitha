import { get_primary_ids_in_order } from '#lib/data/navigation.js'
import type { RequestHandler } from './$types'

export async function GET({ locals: { db }, params: { type } }: Parameters<RequestHandler>[0]) {
	const results = await get_primary_ids_in_order({ db, type })
	return Response.json(results)
}
