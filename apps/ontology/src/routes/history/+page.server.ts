import { get_all_changes } from '#lib/server/changes/changes.js'
import type { PageServerLoad } from './$types'

export async function load({ locals: { db_ontology }, url: { searchParams } }: Parameters<PageServerLoad>[0]) {
	const since = searchParams.get('since')
	const before = searchParams.get('before')

	// TODO should this page only show applied changes?
	const changes = await get_all_changes(db_ontology)

	return {
		changes,
		since,
		before,
	}
}
