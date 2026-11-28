import { describe, expect, it } from 'vitest'
import type { D1DatabaseSession } from '@cloudflare/workers-types'
import { get_user_permissions } from './permissions'

type UserRow = { id: number, email: string }
type PermissionRow = { id: number, app: string, permission: string }
type Grant = { user_id: number, permission_id: number }

type AuthTables = {
	readonly users: readonly UserRow[]
	readonly permissions?: readonly PermissionRow[]
	readonly grants?: readonly Grant[]
}

/**
 * An in-memory DB_Auth that answers get_user_permissions' query the way its LEFT JOINs would, from
 * plain tables and the parameters bound to it: one row per granted permission for the app, or one
 * row with a null permission when the user exists with none.
 */
function make_db_auth({ users, permissions = [], grants = [] }: AuthTables): D1DatabaseSession {
	function rows_for({ app, email }: { app: string, email: string }) {
		const user = users.find(candidate => candidate.email.toLowerCase() === email.toLowerCase())
		if (!user) return []

		const granted = grants
			.filter(({ user_id }) => user_id === user.id)
			.flatMap(({ permission_id }) => permissions.filter(({ id }) => id === permission_id))
			.map(({ app: permission_app, permission }) => permission_app === app ? permission : null)
		if (granted.length === 0) return [{ id: user.id, permission: null }]

		return granted.map(permission => ({ id: user.id, permission }))
	}

	const db_auth = {
		prepare: () => ({
			bind: (app: string, email: string) => ({
				all: async () => ({ results: rows_for({ app, email }) }),
			}),
		}),
	}
	return db_auth as unknown as D1DatabaseSession
}

const PERMISSIONS: PermissionRow[] = [
	{ id: 1, app: 'ontology', permission: 'PROTECTED_ACCESS' },
	{ id: 2, app: 'ontology', permission: 'ADD_CONCEPT' },
	{ id: 3, app: 'sources', permission: 'PROTECTED_ACCESS' },
]

const EMAIL = 'user@example.com'

describe('get_user_permissions', () => {
	it('returns no id and no permissions for an email that is not in Users', async () => {
		const db_auth = make_db_auth({ users: [] })

		expect(await get_user_permissions({ db_auth, email: EMAIL, app: 'ontology' })).toEqual({ id: undefined, permissions: [] })
	})

	it('returns the id with no permissions when the user has no grants', async () => {
		const db_auth = make_db_auth({ users: [{ id: 42, email: EMAIL }] })

		expect(await get_user_permissions({ db_auth, email: EMAIL, app: 'ontology' })).toEqual({ id: 42, permissions: [] })
	})

	it("returns only the requested app's permissions", async () => {
		const db_auth = make_db_auth({
			users: [{ id: 42, email: EMAIL }],
			permissions: PERMISSIONS,
			grants: [1, 2, 3].map(permission_id => ({ user_id: 42, permission_id })),
		})

		expect(await get_user_permissions({ db_auth, email: EMAIL, app: 'ontology' })).toEqual({ id: 42, permissions: ['PROTECTED_ACCESS', 'ADD_CONCEPT'] })
		expect(await get_user_permissions({ db_auth, email: EMAIL, app: 'sources' })).toEqual({ id: 42, permissions: ['PROTECTED_ACCESS'] })
	})

	it("returns the id with no permissions when every grant is for another app's", async () => {
		const db_auth = make_db_auth({
			users: [{ id: 42, email: EMAIL }],
			permissions: PERMISSIONS,
			grants: [{ user_id: 42, permission_id: 3 }],
		})

		expect(await get_user_permissions({ db_auth, email: EMAIL, app: 'ontology' })).toEqual({ id: 42, permissions: [] })
	})
})
