import { can_approve_change, get_all_changes, get_pending_changes } from '$lib/server/changes/changes'
import type { OntologyChange } from '$lib/types'
import type { PageServerLoad } from './$types'

export async function load({ locals: { user, db_ontology }, url: { searchParams } }: Parameters<PageServerLoad>[0]) {
	const status = searchParams.get('status') ?? 'all'

	const changes = status === 'pending'
		? await get_pending_changes(db_ontology)
		: await get_all_changes(db_ontology)

	return {
		changes: changes.map<OntologyChange>(change => ({
			...change,
			can_approve: can_approve_change({ change, permissions: user!.permissions }),
		})),
	}
}
