import { describe, expect, it, vi } from 'vitest'
import { get_user_info, get_user_names } from './auth'
import type { OntologyUser } from '$lib/types'

const NO_PERMISSIONS = { has_protected_access: false, can_add: false, can_update: false }

function make_locals<Row>(rows: Row[], user?: OntologyUser) {
	const all = vi.fn().mockResolvedValue({ results: rows })
	const bind = vi.fn().mockReturnValue({ all })
	const prepare = vi.fn().mockReturnValue({ bind, all })

	return { locals: { db_auth: { prepare }, user } as unknown as App.Locals, prepare, bind, all }
}

const rows_for = (permissions: string[]) => permissions.map(permission => ({ id: 42, permission }))

describe('get_user_info', () => {
	it('queries ontology permissions for the given email', async () => {
		const { locals, bind } = make_locals([])

		await get_user_info({ locals, email: 'user@example.com' })

		expect(bind).toHaveBeenCalledWith('ontology', 'user@example.com')
	})

	it('returns no id and no permissions when the user is not in the database', async () => {
		const { locals } = make_locals([])

		const result = await get_user_info({ locals, email: 'user@example.com' })

		expect(result).toEqual({ id: undefined, permissions: NO_PERMISSIONS })
	})

	it('returns the id with no permissions when the user has no ontology permission rows', async () => {
		const { locals } = make_locals([{ id: 42, permission: null }])

		const result = await get_user_info({ locals, email: 'user@example.com' })

		expect(result).toEqual({ id: 42, permissions: NO_PERMISSIONS })
	})

	it.each([
		[['PROTECTED_ACCESS'], { has_protected_access: true, can_add: false, can_update: false }],
		[['ADD_CONCEPT'], { has_protected_access: false, can_add: true, can_update: false }],
		[['UPDATE_CONCEPT'], { has_protected_access: false, can_add: false, can_update: true }],
		[['PROTECTED_ACCESS', 'ADD_CONCEPT', 'UPDATE_CONCEPT'], { has_protected_access: true, can_add: true, can_update: true }],
	])('maps permission rows %j to flags', async (permissions, expected) => {
		const { locals } = make_locals(rows_for(permissions))

		const result = await get_user_info({ locals, email: 'user@example.com' })

		expect(result).toEqual({ id: 42, permissions: expected })
	})

	it('ignores permissions it does not recognize', async () => {
		const { locals } = make_locals(rows_for(['DELETE_CONCEPT']))

		const result = await get_user_info({ locals, email: 'user@example.com' })

		expect(result).toEqual({ id: 42, permissions: NO_PERMISSIONS })
	})
})

describe('get_user_names', () => {
	const current_user: OntologyUser = { id: 7, email: 'me@example.com', name: 'Me', permissions: NO_PERMISSIONS }

	it('returns an empty map when there are no users and no one is signed in', async () => {
		const { locals } = make_locals([])

		const result = await get_user_names(locals)

		expect(result).toEqual(new Map())
	})

	it('maps each user id to its name', async () => {
		const { locals } = make_locals([{ id: 1, name: 'Alice' }, { id: 2, name: 'bob@example.com' }])

		const result = await get_user_names(locals)

		expect(result).toEqual(new Map([[1, 'Alice'], [2, 'bob@example.com']]))
	})

	it('uses an empty string when the user has neither a name nor an email', async () => {
		const { locals } = make_locals([{ id: 1, name: null }])

		const result = await get_user_names(locals)

		expect(result.get(1)).toBe('')
	})

	it('adds the signed-in user alongside the database rows', async () => {
		const { locals } = make_locals([{ id: 1, name: 'Alice' }], current_user)

		const result = await get_user_names(locals)

		expect(result).toEqual(new Map([[1, 'Alice'], [7, 'Me']]))
	})

	it('uses the signed-in user\'s session name over the database row', async () => {
		const { locals } = make_locals([{ id: 7, name: 'Stale Name' }], current_user)

		const result = await get_user_names(locals)

		expect(result.get(7)).toBe('Me')
	})

	it('falls back to the signed-in user\'s email when their session has no name', async () => {
		const { locals } = make_locals([], { ...current_user, name: undefined as unknown as string })

		const result = await get_user_names(locals)

		expect(result.get(7)).toBe('me@example.com')
	})

	it('does not add a signed-in user who has no id', async () => {
		const { locals } = make_locals([{ id: 1, name: 'Alice' }], { ...current_user, id: undefined })

		const result = await get_user_names(locals)

		expect(result).toEqual(new Map([[1, 'Alice']]))
	})
})
