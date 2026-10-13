import type { Handle } from '@sveltejs/kit'
import { describe, expect, it } from 'vitest'
import { noindex_handle } from './index'

type HandleInput = Parameters<Handle>[0]

function run_handle(response: Response) {
	const event = { request: new Request('http://localhost/') } as HandleInput['event']
	return noindex_handle({ event, resolve: async () => response })
}

describe('noindex_handle', () => {
	it('marks a response noindex and nofollow', async () => {
		const response = await run_handle(new Response('{}'))
		expect(response.headers.get('X-Robots-Tag')).toBe('noindex, nofollow')
	})

	it('leaves the body and other headers alone', async () => {
		const response = await run_handle(new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } }))
		expect(response.headers.get('content-type')).toBe('application/json')
		expect(await response.text()).toBe('{"ok":true}')
	})
})
