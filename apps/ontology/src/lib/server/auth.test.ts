import { describe, expect, it, vi } from 'vitest'
import { get_user_info } from './auth'

const NO_PERMISSIONS = { has_protected_access: false, can_add: false, can_update: false }

function make_locals(rows: { id: number, permission: string | null }[]) {
	const all = vi.fn().mockResolvedValue({ results: rows })
	const bind = vi.fn().mockReturnValue({ all })
	const prepare = vi.fn().mockReturnValue({ bind })

	return { locals: { db_auth: { prepare } } as unknown as App.Locals, prepare, bind, all }
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
