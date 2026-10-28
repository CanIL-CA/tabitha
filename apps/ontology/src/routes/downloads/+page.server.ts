import type { PageServerLoad } from './$types'
import { list_backups } from '#lib/server/backups.js'

export async function load({ locals: { db_ontology } }: Parameters<PageServerLoad>[0]) {
	return list_backups(db_ontology)
}
