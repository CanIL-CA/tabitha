import { get_user_permissions } from '@tabitha/auth'
import type { D1DatabaseSession } from '@cloudflare/workers-types'
import type { UserInfo } from '#lib/types.js'

export async function get_user_info({ db_auth, email }: { db_auth: D1DatabaseSession, email: string }): Promise<UserInfo> {
	const { id, permissions } = await get_user_permissions({ db_auth, email, app: 'sources' })
	return {
		id,
		permissions: {
			has_protected_access: permissions.includes('PROTECTED_ACCESS'),
			can_update: permissions.includes('UPDATE_SOURCE'),
		},
	}
}
