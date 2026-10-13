import { describe, expect, it, mock } from 'bun:test'
import { reconcile_gateway } from './apply'
import { desired_gateway_config, gateway_id } from './config'

const credentials = { account_id: 'acct-1', api_token: 'token-1' }

function fake_fetch(get_status: number): typeof fetch {
	const fetch_mock = mock(async (_url: string, init?: RequestInit) => {
		const method = init?.method ?? 'GET'

		if (method === 'GET') {
			return new Response(null, { status: get_status })
		}

		return new Response(null, { status: 200 })
	})

	return fetch_mock as unknown as typeof fetch
}

describe('reconcile_gateway', () => {
	it('creates the gateway when it does not exist yet, then follows up with an update', async () => {
		const fetch_impl = fake_fetch(404)

		const result = await reconcile_gateway({ credentials, fetch_impl })

		expect(result).toBe('created')
		const calls = (fetch_impl as unknown as ReturnType<typeof mock>).mock.calls
		const [, create_call, update_call] = calls

		expect(create_call[0]).toBe(`https://api.cloudflare.com/client/v4/accounts/${credentials.account_id}/ai-gateway/gateways`)
		expect(create_call[1].method).toBe('POST')
		// eslint-disable-next-line @typescript-eslint/no-unused-vars -- discarding `guardrails`, the field the create endpoint doesn't accept.
		const { guardrails, ...create_only_fields } = desired_gateway_config
		expect(JSON.parse(create_call[1].body)).toEqual({ id: gateway_id, ...create_only_fields })

		// The create endpoint doesn't accept `guardrails` -- confirm the follow-up update applies it.
		expect(update_call[0]).toBe(`https://api.cloudflare.com/client/v4/accounts/${credentials.account_id}/ai-gateway/gateways/${gateway_id}`)
		expect(update_call[1].method).toBe('PUT')
		expect(JSON.parse(update_call[1].body)).toEqual(desired_gateway_config)
	})

	it('updates the gateway when it already exists', async () => {
		const fetch_impl = fake_fetch(200)

		const result = await reconcile_gateway({ credentials, fetch_impl })

		expect(result).toBe('updated')
		const calls = (fetch_impl as unknown as ReturnType<typeof mock>).mock.calls
		const [, update_call] = calls
		expect(update_call[0]).toBe(`https://api.cloudflare.com/client/v4/accounts/${credentials.account_id}/ai-gateway/gateways/${gateway_id}`)
		expect(update_call[1].method).toBe('PUT')
		expect(JSON.parse(update_call[1].body)).toEqual(desired_gateway_config)
	})

	it('sends the Cloudflare bearer token on every request', async () => {
		const fetch_impl = fake_fetch(404)

		await reconcile_gateway({ credentials, fetch_impl })

		const calls = (fetch_impl as unknown as ReturnType<typeof mock>).mock.calls
		for (const [, init] of calls) {
			expect(init.headers.Authorization).toBe(`Bearer ${credentials.api_token}`)
		}
	})

	it('throws with the response body when the existence check fails unexpectedly', async () => {
		const fetch_impl = mock(async () => new Response('account suspended', { status: 403 })) as unknown as typeof fetch

		await expect(reconcile_gateway({ credentials, fetch_impl })).rejects.toThrow(/403/)
	})

	it('throws with the response body when create fails', async () => {
		const fetch_impl = mock(async (_url: string, init?: RequestInit) => {
			const method = init?.method ?? 'GET'
			return new Response(method === 'GET' ? null : 'invalid rate_limiting_limit', { status: method === 'GET' ? 404 : 400 })
		}) as unknown as typeof fetch

		await expect(reconcile_gateway({ credentials, fetch_impl })).rejects.toThrow(/invalid rate_limiting_limit/)
	})
})
