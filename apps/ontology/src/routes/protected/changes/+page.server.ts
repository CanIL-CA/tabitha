import { can_approve_change, get_all_changes, get_pending_changes, transform_with_users } from '$lib/server/changes/changes'
import type { OntologyChange } from '$lib/types'
import type { PageServerLoad } from './$types'

export async function load({ locals, url: { searchParams } }: Parameters<PageServerLoad>[0]) {
	const status = searchParams.get('status') ?? 'all'

	const changes = status === 'pending'
		? await get_pending_changes(locals.db_ontology)
		: await get_all_changes(locals.db_ontology)

	const changes_with_usernames = await transform_with_users({ changes, locals })

	return {
		changes: changes_with_usernames.map<OntologyChange>(change => ({
			...change,
			can_approve: can_approve_change({ change, permissions: locals.user!.permissions }),
		})),
	}
}
