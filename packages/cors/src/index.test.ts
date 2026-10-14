import type { Handle } from '@sveltejs/kit/hooks'
import { describe, expect, it } from 'vitest'
import { create_cors_handle, get_cors_allowed_origin } from './index'

function fake_event(origin: string | null): Parameters<Handle>[0]['event'] {
	const headers = new Headers()
	if (origin) headers.set('Origin', origin)
	return { request: new Request('http://localhost/', { headers }) } as Parameters<Handle>[0]['event']
}

describe('get_cors_allowed_origin', () => {
	it('allows a production subdomain', () => {
		expect(get_cors_allowed_origin({ origin: 'https://ontology.tabitha.bible', allow_localhost: false })).toBe('https://ontology.tabitha.bible')
	})

	it('allows a preview deployment on tbta.workers.dev with a port', () => {
		expect(get_cors_allowed_origin({ origin: 'https://abc123-ontology.tbta.workers.dev:443', allow_localhost: false })).toBe('https://abc123-ontology.tbta.workers.dev:443')
	})

	it('rejects an unrelated domain', () => {
		expect(get_cors_allowed_origin({ origin: 'https://evil.example.com', allow_localhost: false })).toBeNull()
	})

	it('rejects a lookalike domain that merely contains the trusted suffix as a substring', () => {
		expect(get_cors_allowed_origin({ origin: 'https://tabitha.bible.attacker.com', allow_localhost: false })).toBeNull()
	})

	it('rejects a null origin', () => {
		expect(get_cors_allowed_origin({ origin: null, allow_localhost: false })).toBeNull()
	})

	it('rejects a localhost origin when allow_localhost is false (production behavior)', () => {
		expect(get_cors_allowed_origin({ origin: 'http://localhost:5173', allow_localhost: false })).toBeNull()
	})

	it('allows a localhost origin with any port when allow_localhost is true (local dev)', () => {
		expect(get_cors_allowed_origin({ origin: 'http://localhost:8790', allow_localhost: true })).toBe('http://localhost:8790')
	})

	it('allows 127.0.0.1 when allow_localhost is true', () => {
		expect(get_cors_allowed_origin({ origin: 'http://127.0.0.1:5173', allow_localhost: true })).toBe('http://127.0.0.1:5173')
	})

	it('still allows production domains when allow_localhost is true', () => {
		expect(get_cors_allowed_origin({ origin: 'https://ontology.tabitha.bible', allow_localhost: true })).toBe('https://ontology.tabitha.bible')
	})

	it('still rejects an unrelated origin when allow_localhost is true', () => {
		expect(get_cors_allowed_origin({ origin: 'https://evil.example.com', allow_localhost: true })).toBeNull()
	})
})

describe('create_cors_handle', () => {
	const resolve: Parameters<Handle>[0]['resolve'] = async () => new Response('ok')

	it('sets Access-Control-Allow-Origin for a trusted origin', async () => {
		const handle = create_cors_handle({ allow_localhost: false })
		const response = await handle({ event: fake_event('https://ontology.tabitha.bible'), resolve })
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://ontology.tabitha.bible')
	})

	it('does not set the header for an untrusted origin', async () => {
		const handle = create_cors_handle({ allow_localhost: false })
		const response = await handle({ event: fake_event('https://evil.example.com'), resolve })
		expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
	})

	it('does not set the header for a localhost origin when allow_localhost is false', async () => {
		const handle = create_cors_handle({ allow_localhost: false })
		const response = await handle({ event: fake_event('http://localhost:5173'), resolve })
		expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull()
	})

	it('sets the header for a localhost origin when allow_localhost is true', async () => {
		const handle = create_cors_handle({ allow_localhost: true })
		const response = await handle({ event: fake_event('http://localhost:5173'), resolve })
		expect(response.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:5173')
	})

	it('preserves the resolved response body', async () => {
		const handle = create_cors_handle({ allow_localhost: false })
		const response = await handle({ event: fake_event(null), resolve })
		expect(await response.text()).toBe('ok')
	})
})
