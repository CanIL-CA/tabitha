import type { UserEmail, UserInfo } from '$lib/types'

export async function get_user_info({ locals, email }: { locals: App.Locals, email: UserEmail }): Promise<UserInfo> {
	const sql = `
		SELECT u.id, p.permission
		FROM Users u
		LEFT JOIN User_Permissions up ON up.user_id = u.id
		LEFT JOIN Permissions p ON p.id = up.permission_id AND p.app = ?
		WHERE u.email = ?
	`
	const { results } = await locals.db_auth.prepare(sql).bind('ontology', email).all<{ id: number, permission: string | null }>()
	const permissions = results.map(({ permission }) => permission)
	return {
		id: results[0]?.id,
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
