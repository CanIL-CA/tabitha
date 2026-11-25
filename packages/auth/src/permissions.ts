import type { D1DatabaseSession } from '@cloudflare/workers-types'

export type UserPermissions = {
	/** The user's `Users.id`, or undefined when no one has been granted anything under this email. */
	readonly id: number | undefined
	/** The permission names granted for the requested app, e.g. `PROTECTED_ACCESS`. */
	readonly permissions: readonly string[]
}

type GetUserPermissionsOptions = {
	readonly db_auth: D1DatabaseSession
	readonly email: string
	/** The `Permissions.app` to read grants for, e.g. `'ontology'`. */
	readonly app: string
}

export async function get_user_permissions({ db_auth, email, app }: GetUserPermissionsOptions): Promise<UserPermissions> {
	const sql = `
		SELECT u.id, p.permission
		FROM Users u
		LEFT JOIN User_Permissions up ON up.user_id = u.id
		LEFT JOIN Permissions p ON p.id = up.permission_id AND p.app = ?
		WHERE u.email = ? COLLATE NOCASE
	`
	const { results } = await db_auth.prepare(sql).bind(app, email).all<{ id: number, permission: string | null }>()

	return {
		id: results[0]?.id,
		permissions: results.flatMap(({ permission }) => permission ? [permission] : []),
	}
}
