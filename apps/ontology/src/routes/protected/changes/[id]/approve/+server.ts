import { is_authorized } from '#lib/server/auth.js'
import { approve_change, can_approve_change, get_change } from '#lib/server/changes/changes.js'
import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export async function POST({ params, locals }: Parameters<RequestHandler>[0]) {
	const id = Number(params.id)
	const change = await get_change({ db: locals.db_ontology, id })
	if (!change) {
		throw error(404, 'Change not found.')
	}

	const can_add = await is_authorized({ locals, permission: 'ADD_CONCEPT' })
	const can_update = await is_authorized({ locals, permission: 'UPDATE_CONCEPT' })
	if (!can_approve_change({ change, permissions: { can_add, can_update } })) {
		throw error(403, `You must have permission to ${change.action === 'create' ? 'add' : 'update'} a concept in the Ontology.`)
	}

	const updated = await approve_change({ db: locals.db_ontology, id, user: locals.user! })

	return Response.json({ change: { ...updated, can_approve: can_approve_change({ change: updated, permissions: { can_add, can_update } }) } })
}
