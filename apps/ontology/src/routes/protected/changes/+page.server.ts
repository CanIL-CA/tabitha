import { can_approve_change, get_all_changes, get_pending_changes } from '#lib/server/changes/changes.js'
import type { OntologyChange } from '#lib/types.js'
import type { PageServerLoad } from './$types'

export async function load({ locals: { db_ontology }, url: { searchParams }, parent }: Parameters<PageServerLoad>[0]) {
	const status = searchParams.get('status') ?? 'all'

	const changes = status === 'pending'
		? await get_pending_changes(db_ontology)
		: await get_all_changes(db_ontology)

	const { can_add, can_update } = await parent()

	return {
		changes: changes.map<OntologyChange>(change => ({
			...change,
			can_approve: can_approve_change({ change, permissions: { can_add, can_update } }),
		})),
	}
}
