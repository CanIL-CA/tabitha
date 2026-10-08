import { approve_change, can_approve_change, get_change } from '$lib/server/changes/changes'
import { error, json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

export async function POST({ params, locals }: Parameters<RequestHandler>[0]) {
	const id = Number(params.id)
	const change = await get_change({ db: locals.db_ontology, id })
	if (!change) {
		throw error(404, 'Change not found.')
	}

	const permissions = locals.user!.permissions

	if (!can_approve_change({ change, permissions })) {
		throw error(403, `You must have permission to ${change.action === 'create' ? 'add' : 'update'} a concept in the Ontology.`)
	}

	const updated = await approve_change({ db: locals.db_ontology, id, user: locals.user! })

	return json({ change: { ...updated, can_approve: can_approve_change({ change: updated, permissions }) } })
}
