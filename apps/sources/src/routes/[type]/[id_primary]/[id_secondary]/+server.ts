import { get_tertiary_ids } from '#lib/data/read.js'
import type { RequestHandler } from './$types'

export async function GET({ locals: { db }, params: { type, id_primary, id_secondary } }: Parameters<RequestHandler>[0]) {
	const results = await get_tertiary_ids({ db, type, id_primary, id_secondary })
	return Response.json(results)
}
