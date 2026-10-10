import { describe, expect, it, vi } from 'vitest'
import { is_authorized } from './auth'

function make_locals({ user, first_result }: {
	user: App.Locals['user']
	first_result: boolean | null
}) {
	const first = vi.fn().mockResolvedValue(first_result)
	const bind = vi.fn().mockReturnValue({ first })
	const prepare = vi.fn().mockReturnValue({ bind })

	return { locals: { user, db_auth: { prepare } } as unknown as App.Locals, prepare, bind, first }
}

describe('is_authorized', () => {
	it('returns false without querying the database when there is no logged-in user', async () => {
		const { locals, prepare } = make_locals({ user: undefined, first_result: true })

		const result = await is_authorized({ locals, permission: 'ADD_CONCEPT' })

		expect(result).toBe(false)
		expect(prepare).not.toHaveBeenCalled()
	})

	it("returns true when the user's permission row is found", async () => {
		const { locals, bind } = make_locals({ user: { email: 'user@example.com' } as App.Locals['user'], first_result: true })

		const result = await is_authorized({ locals, permission: 'ADD_CONCEPT' })

		expect(result).toBe(true)
		expect(bind).toHaveBeenCalledWith('ontology', 'user@example.com', 'ADD_CONCEPT')
	})

	it('returns false when no matching permission row exists', async () => {
		const { locals } = make_locals({ user: { email: 'user@example.com' } as App.Locals['user'], first_result: null })

		const result = await is_authorized({ locals, permission: 'DELETE_CONCEPT' })

		expect(result).toBe(false)
	})
})
