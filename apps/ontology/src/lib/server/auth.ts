import { get_user_permissions } from '@tabitha/auth'
import type { UserEmail, UserInfo } from '#lib/types.js'

export async function get_user_info({ locals, email }: { locals: App.Locals, email: UserEmail }): Promise<UserInfo> {
	const { id, permissions } = await get_user_permissions({ db_auth: locals.db_auth, email, app: 'ontology' })
	return {
		id,
		permissions: {
			has_protected_access: permissions.includes('PROTECTED_ACCESS'),
			can_add: permissions.includes('ADD_CONCEPT'),
			can_update: permissions.includes('UPDATE_CONCEPT'),
		},
	}
}

export async function get_user_names({ db_auth, user }: App.Locals): Promise<Map<number, string>> {
	const sql = 'SELECT id, COALESCE(name, email) AS name FROM Users'
	const { results } = await db_auth.prepare(sql).all<{ id: number, name: string | null }>()
	const map = new Map(results.map(({ id, name }) => [id, name ?? '']))
	if (user?.id) {
		map.set(user.id, user.name ?? user.email ?? '')
	}
	return map
}
