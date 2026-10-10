import { is_authorized } from '#lib/server/auth.js'
import { apply_change_directly, suggest_change } from '#lib/server/changes/changes.js'
import { get_concept_for_update } from '#lib/server/changes/concepts.js'
import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import type { ConceptCreateData } from '#lib/types.js'

export async function POST({ request, locals }: Parameters<RequestHandler>[0]) {
	const data: ConceptCreateData = await request.json()

	const existing = await get_concept_for_update({ db: locals.db_ontology, concept_key: data })
	if (existing) {
		throw error(400, 'A concept with this stem, sense, and part of speech already exists.')
	}

	const can_apply_directly = await is_authorized({ locals, permission: 'ADD_CONCEPT' })
	const submission = { db: locals.db_ontology, action: 'create' as const, data, user: locals.user! }

	let applied: boolean
	try {
		applied = can_apply_directly ? await apply_change_directly(submission) : await suggest_change(submission)
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err)
		throw error(500, `Failed to create concept: ${message}`)
	}

	return Response.json({ applied })
}
