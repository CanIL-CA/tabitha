import { can_approve_change, can_edit_change, get_all_changes, transform_with_users } from '#lib/server/changes/changes.js'
import type { OntologyChange } from '#lib/types.js'
import type { PageServerLoad } from './$types'

export async function load({ locals }: Parameters<PageServerLoad>[0]) {
	const changes = await get_all_changes(locals.db_ontology)

	// before transform_with_users, which drops the user ids can_edit_change compares against
	const changes_with_permissions = changes.map<OntologyChange>(change => ({
		...change,
		can_approve: can_approve_change({ change, permissions: locals.user!.permissions }),
		can_edit: can_edit_change({ change, user: locals.user! }),
	}))

	return {
		changes: await transform_with_users({ changes: changes_with_permissions, locals }),
	}
}
