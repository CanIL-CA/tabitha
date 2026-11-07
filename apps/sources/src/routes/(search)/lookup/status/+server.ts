import { get_verse_statuses } from '#lib/data/status.js'
import type { RequestHandler } from './$types'
import type { Reference } from '@tabitha/types'

export async function POST({ locals: { db }, request }: Parameters<RequestHandler>[0]) {
	const references: Reference[] = await request.json()

	const results = await get_verse_statuses({ db, references })

	return Response.json(results)
}
