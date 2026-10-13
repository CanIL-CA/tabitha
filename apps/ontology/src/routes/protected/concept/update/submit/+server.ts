import { apply_change_directly, suggest_change } from '#lib/server/changes/changes.js'
import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import type { ConceptUpdateData } from '#lib/types.js'

export async function POST({ request, locals }: Parameters<RequestHandler>[0]) {
	const data: ConceptUpdateData = await request.json()

	const can_apply_directly = locals.user!.permissions.can_update
	const submission = { db: locals.db_ontology, action: 'update' as const, data, user: locals.user! }

	try {
		const applied = can_apply_directly ? await apply_change_directly(submission) : await suggest_change(submission)
		return Response.json({ applied })
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err)
		throw error(500, `Failed to record update: ${message}`)
	}
}
