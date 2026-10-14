import type { Handle } from '@sveltejs/kit/hooks'
import type { RateLimit } from '@cloudflare/workers-types'
import { describe, expect, it } from 'vitest'
import { create_rate_limit_handle, enforce_rate_limit } from './index'

function fake_rate_limiter(success: boolean): RateLimit {
	return {
		limit: async () => ({ success }),
	} as RateLimit
}

function fake_event({
	pathname = '/',
	client_address = '1.2.3.4',
}: {
	readonly pathname?: string
	readonly client_address?: string
}): Parameters<Handle>[0]['event'] {
	return {
		request: new Request(`http://localhost${pathname}`),
		getClientAddress: () => client_address,
	} as unknown as Parameters<Handle>[0]['event']
}

describe('enforce_rate_limit', () => {
	it('returns null when the request is within limits', async () => {
		const result = await enforce_rate_limit({ rate_limiter: fake_rate_limiter(true), key: '1.2.3.4' })
		expect(result).toBeNull()
	})

	it('returns a 429 response when the request exceeds the limit', async () => {
		const result = await enforce_rate_limit({ rate_limiter: fake_rate_limiter(false), key: '1.2.3.4' })
		expect(result).not.toBeNull()
		expect(result?.status).toBe(429)
		expect(result?.headers.get('retry-after')).toBe('60')
		expect(result?.headers.get('content-type')).toBe('application/json')
	})

	it('includes a human-readable error message in the 429 body', async () => {
		const result = await enforce_rate_limit({ rate_limiter: fake_rate_limiter(false), key: '1.2.3.4' })
		const body = await result?.json()
		expect(body).toEqual({ error: 'Too many requests. Please slow down and try again shortly.' })
	})

	it('passes the given key through to the rate limiter', async () => {
		let received_key: string | undefined
		const rate_limiter = {
			limit: async ({ key }: { key: string }) => {
				received_key = key
				return { success: true }
			},
		} as RateLimit
		await enforce_rate_limit({ rate_limiter, key: 'client-9.9.9.9' })
		expect(received_key).toBe('client-9.9.9.9')
	})
})

describe('create_rate_limit_handle', () => {
	const resolve: Parameters<Handle>[0]['resolve'] = async () => new Response('ok')

	it('resolves the request when within limits', async () => {
		const handle = create_rate_limit_handle({ env: { RATE_LIMITER: fake_rate_limiter(true) } })
		const response = await handle({ event: fake_event({}), resolve })
		expect(await response.text()).toBe('ok')
	})

	it('returns 429 when the limit is exceeded', async () => {
		const handle = create_rate_limit_handle({ env: { RATE_LIMITER: fake_rate_limiter(false) } })
		const response = await handle({ event: fake_event({}), resolve })
		expect(response.status).toBe(429)
	})

	it('fails open (resolves normally) when the RATE_LIMITER binding is missing', async () => {
		const handle = create_rate_limit_handle({ env: {} })
		const response = await handle({ event: fake_event({}), resolve })
		expect(await response.text()).toBe('ok')
	})

	it('skips enforcement for a path matching a skip prefix, even over the limit', async () => {
		const handle = create_rate_limit_handle({ env: { RATE_LIMITER: fake_rate_limiter(false) }, skip_path_prefixes: ['/protected', '/auth'] })
		const response = await handle({
			event: fake_event({ pathname: '/protected/changes' }),
			resolve,
		})
		expect(await response.text()).toBe('ok')
	})

	it('still enforces the limit for a path not matching any skip prefix', async () => {
		const handle = create_rate_limit_handle({ env: { RATE_LIMITER: fake_rate_limiter(false) }, skip_path_prefixes: ['/protected', '/auth'] })
		const response = await handle({
			event: fake_event({ pathname: '/search' }),
			resolve,
		})
		expect(response.status).toBe(429)
	})

	it('resolves without checking the limit at all when disabled, even over the limit', async () => {
		const handle = create_rate_limit_handle({ env: { RATE_LIMITER: fake_rate_limiter(false) }, disabled: true })
		const response = await handle({ event: fake_event({}), resolve })
		expect(await response.text()).toBe('ok')
	})

	it('resolves without checking the limit when disabled, even with no binding present', async () => {
		const handle = create_rate_limit_handle({ env: {}, disabled: true })
		const response = await handle({ event: fake_event({}), resolve })
		expect(await response.text()).toBe('ok')
	})
})
