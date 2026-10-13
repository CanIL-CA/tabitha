import { get_primary_ids } from '#lib/data/read.js'
import type { RequestHandler } from './$types'

export async function GET({ locals: { db }, params: { type } }: Parameters<RequestHandler>[0]) {
	const results = await get_primary_ids({ db, type })
	return Response.json(results)
}
