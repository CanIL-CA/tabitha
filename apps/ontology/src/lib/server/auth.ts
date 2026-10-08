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
