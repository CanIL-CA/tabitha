import { describe, expect, it } from 'vitest'
import { get_user_info, get_user_names } from './auth'
import type { OntologyUser } from '#lib/types.js'

const NO_PERMISSIONS = { has_protected_access: false, can_add: false, can_update: false }

type UserRow = { id: number, email: string, name: string | null }
type PermissionRow = { id: number, app: string, permission: string }
type Grant = { user_id: number, permission_id: number }

type AuthTables = {
	readonly users: readonly UserRow[]
	readonly permissions?: readonly PermissionRow[]
	readonly grants?: readonly Grant[]
}

/**
 * An in-memory DB_Auth that answers the two queries auth.ts asks, from plain tables and the
 * parameters bound to them, so a test sees who comes back for a given email and app.
 */
function make_locals({ tables, user }: { tables: AuthTables, user?: OntologyUser }) {
	const { users, permissions = [], grants = [] } = tables

	function permission_rows({ app, email }: { app: string, email: string }) {
		const matched_user = users.find(candidate => candidate.email === email)
		if (!matched_user) return []

		const own_permissions = grants
			.filter(({ user_id }) => user_id === matched_user.id)
			.flatMap(({ permission_id }) => permissions.filter(({ id, app: permission_app }) => id === permission_id && permission_app === app))
		if (own_permissions.length === 0) return [{ id: matched_user.id, permission: null }]

		return own_permissions.map(({ permission }) => ({ id: matched_user.id, permission }))
	}

	function statement({ sql, params }: { sql: string, params: unknown[] }) {
		return {
			bind: (...bound: unknown[]) => statement({ sql, params: bound }),
			all: async () => {
				if (sql.includes('JOIN User_Permissions')) {
					const [app, email] = params as [string, string]
					return { results: permission_rows({ app, email }) }
				}
				return { results: users.map(({ id, name, email }) => ({ id, name: name ?? email })) }
			},
		}
	}

	const db_auth = { prepare: (sql: string) => statement({ sql, params: [] }) }
	return { locals: { db_auth, user } as unknown as App.Locals }
}

const PERMISSIONS: PermissionRow[] = [
	{ id: 1, app: 'ontology', permission: 'PROTECTED_ACCESS' },
	{ id: 2, app: 'ontology', permission: 'ADD_CONCEPT' },
	{ id: 3, app: 'ontology', permission: 'UPDATE_CONCEPT' },
	{ id: 4, app: 'ontology', permission: 'DELETE_CONCEPT' },
	{ id: 5, app: 'editor', permission: 'ADD_CONCEPT' },
]

const USER_EMAIL = 'user@example.com'

function grants_for({ user_id, permission_ids }: { user_id: number, permission_ids: number[] }): Grant[] {
	return permission_ids.map(permission_id => ({ user_id, permission_id }))
}

function user_with_permissions(permission_ids: number[]) {
	return make_locals({
		tables: {
			users: [{ id: 42, email: USER_EMAIL, name: 'User' }],
			permissions: PERMISSIONS,
			grants: grants_for({ user_id: 42, permission_ids }),
		},
	}).locals
}

describe('get_user_info', () => {
	it('returns no id and no permissions when the user is not in the database', async () => {
		const { locals } = make_locals({ tables: { users: [] } })

		const result = await get_user_info({ locals, email: USER_EMAIL })

		expect(result).toEqual({ id: undefined, permissions: NO_PERMISSIONS })
	})

	it('returns the id with no permissions when the user has no permission rows', async () => {
		const { locals } = make_locals({ tables: { users: [{ id: 42, email: USER_EMAIL, name: 'User' }] } })

		const result = await get_user_info({ locals, email: USER_EMAIL })

		expect(result).toEqual({ id: 42, permissions: NO_PERMISSIONS })
	})

	it.each([
		['PROTECTED_ACCESS', [1], { has_protected_access: true, can_add: false, can_update: false }],
		['ADD_CONCEPT', [2], { has_protected_access: false, can_add: true, can_update: false }],
		['UPDATE_CONCEPT', [3], { has_protected_access: false, can_add: false, can_update: true }],
		['all three', [1, 2, 3], { has_protected_access: true, can_add: true, can_update: true }],
	])('maps %s to flags', async (_, permission_ids, expected) => {
		const result = await get_user_info({ locals: user_with_permissions(permission_ids), email: USER_EMAIL })

		expect(result).toEqual({ id: 42, permissions: expected })
	})

	it('ignores permissions it does not recognize', async () => {
		const result = await get_user_info({ locals: user_with_permissions([4]), email: USER_EMAIL })

		expect(result).toEqual({ id: 42, permissions: NO_PERMISSIONS })
	})

	it('ignores permissions granted for another app', async () => {
		const result = await get_user_info({ locals: user_with_permissions([5]), email: USER_EMAIL })

		expect(result).toEqual({ id: 42, permissions: NO_PERMISSIONS })
	})

	it('reports only the permissions of the user whose email was given', async () => {
		const { locals } = make_locals({
			tables: {
				users: [{ id: 1, email: 'admin@example.com', name: 'Admin' }, { id: 2, email: USER_EMAIL, name: 'User' }],
				permissions: PERMISSIONS,
				grants: grants_for({ user_id: 1, permission_ids: [1, 2, 3] }),
			},
		})

		const result = await get_user_info({ locals, email: USER_EMAIL })

		expect(result).toEqual({ id: 2, permissions: NO_PERMISSIONS })
	})
})

describe('get_user_names', () => {
	const current_user: OntologyUser = { id: 7, email: 'me@example.com', name: 'Me', permissions: NO_PERMISSIONS }

	it('returns an empty map when there are no users and no one is signed in', async () => {
		const { locals } = make_locals({ tables: { users: [] } })

		const result = await get_user_names(locals)

		expect(result).toEqual(new Map())
	})

	it('maps each user id to its name', async () => {
		const { locals } = make_locals({ tables: { users: [{ id: 1, email: 'a@example.com', name: 'Alice' }, { id: 2, email: 'bob@example.com', name: null }] } })

		const result = await get_user_names(locals)

		expect(result).toEqual(new Map([[1, 'Alice'], [2, 'bob@example.com']]))
	})

	it('uses an empty string when the user has neither a name nor an email', async () => {
		const { locals } = make_locals({ tables: { users: [{ id: 1, email: '', name: null }] } })

		const result = await get_user_names(locals)

		expect(result.get(1)).toBe('')
	})

	it('adds the signed-in user alongside the database rows', async () => {
		const { locals } = make_locals({ tables: { users: [{ id: 1, email: 'a@example.com', name: 'Alice' }] }, user: current_user })

		const result = await get_user_names(locals)

		expect(result).toEqual(new Map([[1, 'Alice'], [7, 'Me']]))
	})

	it('uses the signed-in user\'s session name over the database row', async () => {
		const { locals } = make_locals({ tables: { users: [{ id: 7, email: 'me@example.com', name: 'Stale Name' }] }, user: current_user })

		const result = await get_user_names(locals)

		expect(result.get(7)).toBe('Me')
	})

	it('falls back to the signed-in user\'s email when their session has no name', async () => {
		const { locals } = make_locals({ tables: { users: [] }, user: { ...current_user, name: undefined as unknown as string } })

		const result = await get_user_names(locals)

		expect(result.get(7)).toBe('me@example.com')
	})

	it('does not add a signed-in user who has no id', async () => {
		const { locals } = make_locals({ tables: { users: [{ id: 1, email: 'a@example.com', name: 'Alice' }] }, user: { ...current_user, id: undefined } })

		const result = await get_user_names(locals)

		expect(result).toEqual(new Map([[1, 'Alice']]))
	})
})
