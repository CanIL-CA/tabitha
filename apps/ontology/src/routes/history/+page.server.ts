import { get_all_changes, transform_with_users } from '$lib/server/changes/changes'
import type { PageServerLoad } from './$types'

export async function load({ locals, url: { searchParams } }: Parameters<PageServerLoad>[0]) {
	const since = searchParams.get('since')
	const before = searchParams.get('before')

	// TODO should this page only show applied changes?
	const changes = await get_all_changes(locals.db_ontology)

	return {
		changes: await transform_with_users({ changes, locals }),
		since,
		before,
	}
}
