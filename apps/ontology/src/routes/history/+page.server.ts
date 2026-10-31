import { get_all_changes, transform_with_users } from '#lib/server/changes/changes.js'
import type { PageServerLoad } from './$types'

export async function load({ locals }: Parameters<PageServerLoad>[0]) {
	const changes = await get_all_changes(locals.db_ontology)

	return {
		changes: await transform_with_users({ changes, locals }),
	}
}
