import { is_authorized } from '#lib/server/auth.js'
import { get_version } from '#lib/server/ontology.js'
import type { LayoutServerLoadEvent } from './$types'
import type { User } from '@auth/sveltekit'

type LayoutData = {
	version: string
	user: User|undefined
	can_update: boolean
	can_add: boolean
	has_protected_access: boolean
}

export async function load({ locals }: LayoutServerLoadEvent): Promise<LayoutData> {
	const version = await get_version(locals.db_ontology)

	const session = await locals.auth()

	const can_update = await is_authorized({ locals, permission: 'UPDATE_CONCEPT' })
	const can_add = await is_authorized({ locals, permission: 'ADD_CONCEPT' })
	const has_protected_access = await is_authorized({ locals, permission: 'PROTECTED_ACCESS' })

	return {
		version,
		user: session?.user,
		can_update,
		can_add,
		has_protected_access,
	}
}
