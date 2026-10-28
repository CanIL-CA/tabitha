import type { RequestHandler } from './$types'
import { list_backups } from '#lib/server/backups.js'

export async function GET({ locals: { db_ontology } }: Parameters<RequestHandler>[0]) {
	const { backups } = await list_backups(db_ontology)
	return Response.json(backups)
}
