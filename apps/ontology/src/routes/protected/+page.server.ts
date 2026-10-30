import { count_changes_awaiting_approval } from '#lib/server/changes/changes.js'
import type { PageServerLoad } from './$types'

export async function load({ locals }: Parameters<PageServerLoad>[0]) {
	return {
		awaiting_approval_count: await count_changes_awaiting_approval({ db: locals.db_ontology, permissions: locals.user?.permissions }),
	}
}
