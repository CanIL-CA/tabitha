import { apply_change_directly, edit_suggested_change, get_and_validate_change, suggest_change } from '#lib/server/changes/changes.js'
import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import type { ConceptSubmission } from '#lib/types.js'
import { concepts_match } from '@tabitha/types/patterns'

export async function POST({ request, locals }: Parameters<RequestHandler>[0]) {
	const { change_id, ...data }: ConceptSubmission = await request.json()
	const is_editing_suggestion = change_id !== undefined

	if (is_editing_suggestion) {
		const change = await get_and_validate_change({ id: change_id, locals, action: 'update' })
		if (!concepts_match({ a: change.concept, b: data })) {
			throw error(400, `The specified change does not apply to the concept in the data.`)
		}
	}

	const can_apply_directly = locals.user!.permissions.can_update
	const submission = { db: locals.db_ontology, action: 'update' as const, data, user: locals.user! }

	try {
		const applied = is_editing_suggestion
			? await edit_suggested_change({ ...submission, id: change_id })
			: can_apply_directly ? await apply_change_directly(submission) : await suggest_change(submission)
		return Response.json({ applied })
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err)
		throw error(500, `Failed to record update: ${message}`)
	}
}
