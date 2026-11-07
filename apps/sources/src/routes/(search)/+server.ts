import { get_types } from '#lib/data/read.js'
import type { RequestHandler } from './$types'

export async function GET({ locals: { db } }: Parameters<RequestHandler>[0]) {
	const results = await get_types(db)
	return Response.json(results)
}
