import { describe, expect, it } from 'vitest'
import type { D1DatabaseSession } from '@cloudflare/workers-types'
import { get_user_info } from './auth'

/** A DB_Auth whose one query returns `rows`, recording the app it was asked about. */
function make_db_auth(rows: { id: number, permission: string | null }[]) {
	const asked = { app: '' }
	const db_auth = {
		prepare: () => ({
			bind: (app: string) => {
				asked.app = app
				return { all: async () => ({ results: rows }) }
			},
		}),
	}
	return { db_auth: db_auth as unknown as D1DatabaseSession, asked }
}

const EMAIL = 'user@example.com'

describe('get_user_info', () => {
	it("reads Sources' grants, not another app's", async () => {
		const { db_auth, asked } = make_db_auth([])

		await get_user_info({ db_auth, email: EMAIL })

		expect(asked.app).toBe('sources')
	})

	it('returns no id and no permissions for an unknown user', async () => {
		const { db_auth } = make_db_auth([])

		expect(await get_user_info({ db_auth, email: EMAIL })).toEqual({
			id: undefined,
			permissions: { has_protected_access: false, can_update: false },
		})
	})

	it.each([
		['PROTECTED_ACCESS', { has_protected_access: true, can_update: false }],
		['UPDATE_SOURCE', { has_protected_access: false, can_update: true }],
	])('maps %s to its flag', async (permission, expected) => {
		const { db_auth } = make_db_auth([{ id: 7, permission }])

		expect(await get_user_info({ db_auth, email: EMAIL })).toEqual({ id: 7, permissions: expected })
	})
})
