import { apply_change_directly, edit_suggested_change, get_and_validate_change, suggest_change } from '#lib/server/changes/changes.js'
import { get_concept_for_update } from '#lib/server/changes/concepts.js'
import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import type { ConceptSubmission } from '#lib/types.js'

export async function POST({ request, locals }: Parameters<RequestHandler>[0]) {
	const { change_id, ...data }: ConceptSubmission = await request.json()

	const existing = await get_concept_for_update({ db: locals.db_ontology, concept_key: data })
	if (existing) {
		throw error(400, 'A concept with this stem, sense, and part of speech already exists.')
	}

	const is_editing_suggestion = change_id !== undefined
	if (is_editing_suggestion) {
		await get_and_validate_change({ id: change_id, locals, action: 'create' })
	}

	const can_apply_directly = locals.user!.permissions.can_add
	const submission = { db: locals.db_ontology, action: 'create' as const, data, user: locals.user! }

	try {
		const applied = is_editing_suggestion
			? await edit_suggested_change({ ...submission, id: change_id })
			: can_apply_directly ? await apply_change_directly(submission) : await suggest_change(submission)
		return Response.json({ applied })
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err)
		throw error(500, `Failed to create concept: ${message}`)
	}
}
