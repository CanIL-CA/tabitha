import { describe, expect, it } from 'vitest'
import { create_http_client } from './http'
import { find_service_fetch, use_service_bindings, type ServiceBinding } from './service_bindings'

// The registry is module state with no reset, so each test uses its own origin

type BoundCall = { input: string, headers: Headers }

function fake_binding({ calls = [] }: { calls?: BoundCall[] } = {}): ServiceBinding {
	return {
		fetch: async (input, init) => {
			calls.push({ input, headers: new Headers((init as RequestInit | undefined)?.headers) })
			return Response.json({ via: 'binding' })
		},
	}
}

describe('use_service_bindings', () => {
	it('registers a fetch for the origin of each route that has a binding', () => {
		use_service_bindings({ routes: [{ base_url: 'https://registers.test/api', binding: fake_binding() }] })

		expect(find_service_fetch('https://registers.test/other/path')).toBeTypeOf('function')
	})

	it('skips a route with no binding', () => {
		use_service_bindings({ routes: [{ base_url: 'https://unbound.test' }] })

		expect(find_service_fetch('https://unbound.test')).toBeUndefined()
	})

	it('registers nothing when disabled', () => {
		use_service_bindings({ routes: [{ base_url: 'https://disabled.test', binding: fake_binding() }], disabled: true })

		expect(find_service_fetch('https://disabled.test')).toBeUndefined()
	})

	it('sets host from the request URL and keeps the caller\'s other headers', async () => {
		const calls: BoundCall[] = []
		use_service_bindings({ routes: [{ base_url: 'https://headers.test', binding: fake_binding({ calls }) }] })

		await find_service_fetch('https://headers.test')?.('https://headers.test/words', { headers: { 'x-trace': 'abc' } })

		expect(calls).toHaveLength(1)
		expect(calls[0].input).toBe('https://headers.test/words')
		expect(calls[0].headers.get('host')).toBe('headers.test')
		expect(calls[0].headers.get('x-trace')).toBe('abc')
	})
})

describe('find_service_fetch', () => {
	it('returns undefined for an unparseable URL', () => {
		expect(find_service_fetch('not a url')).toBeUndefined()
	})

	it('returns undefined for an unregistered origin', () => {
		expect(find_service_fetch('https://never-registered.test')).toBeUndefined()
	})
})

describe('create_http_client fetch resolution', () => {
	it('uses a binding registered after the client was created', async () => {
		const client = create_http_client({ base_url: 'https://late.test' })
		const calls: BoundCall[] = []
		use_service_bindings({ routes: [{ base_url: 'https://late.test', binding: fake_binding({ calls }) }] })

		const result = await client.get<{ via: string }>('/x')

		expect(result).toEqual({ via: 'binding' })
		expect(calls[0].input).toBe('https://late.test/x')
	})

	it('prefers options.fetch over a registered binding', async () => {
		const calls: BoundCall[] = []
		use_service_bindings({ routes: [{ base_url: 'https://override.test', binding: fake_binding({ calls }) }] })
		const client = create_http_client({
			base_url: 'https://override.test',
			fetch: async () => Response.json({ via: 'option' }),
		})

		const result = await client.get<{ via: string }>('/x')

		expect(result).toEqual({ via: 'option' })
		expect(calls).toHaveLength(0)
	})

	it('falls back to globalThis.fetch when nothing is registered', async () => {
		const original_fetch = globalThis.fetch
		globalThis.fetch = (async () => Response.json({ via: 'global' })) as typeof fetch
		try {
			const result = await create_http_client({ base_url: 'https://global.test' }).get<{ via: string }>('/x')

			expect(result).toEqual({ via: 'global' })
		} finally {
			globalThis.fetch = original_fetch
		}
	})
})
