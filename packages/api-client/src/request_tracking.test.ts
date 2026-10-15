import { afterEach, describe, expect, test, vi } from 'vitest'
import { create_http_client, use_request_tracking } from './index'

const BASE_URL = 'http://localhost:1337'

function fake_fetch() {
	return vi.fn<typeof fetch>(async () => Response.json({ ok: true }))
}

describe('request tracking', () => {
	afterEach(() => use_request_tracking(request => request))

	test('hands each request to the registered tracker and still returns the response data', async () => {
		const tracked_requests: Promise<unknown>[] = []
		use_request_tracking(request => {
			tracked_requests.push(request)
			return request
		})
		const http = create_http_client({ base_url: BASE_URL, fetch: fake_fetch() })

		const from_get = await http.get<{ ok: boolean }>('/check')
		const from_post = await http.post<{ ok: boolean }>('/check', { text: 'hi' })

		expect(tracked_requests).toHaveLength(2)
		expect(from_get).toEqual({ ok: true })
		expect(from_post).toEqual({ ok: true })
	})

	test('works when nothing is registered, as on the server', async () => {
		const http = create_http_client({ base_url: BASE_URL, fetch: fake_fetch() })

		expect(await http.get('/check')).toEqual({ ok: true })
	})

	test.each(['get', 'post'] as const)('an untracked %s stays out of the tracker', async method => {
		let tracked_count = 0
		use_request_tracking(request => {
			tracked_count++
			return request
		})
		const http = create_http_client({ base_url: BASE_URL, fetch: fake_fetch() })

		const result = await (method === 'get'
			? http.get('/slow', { untracked: true })
			: http.post('/slow', {}, { untracked: true }))

		expect(result).toEqual({ ok: true })
		expect(tracked_count).toBe(0)
	})

	test('does not send the untracked option on to fetch', async () => {
		const fetch_mock = fake_fetch()
		const http = create_http_client({ base_url: BASE_URL, fetch: fetch_mock })

		await http.post('/slow', {}, { untracked: true, headers: { 'X-Test': '1' } })

		const [, init] = fetch_mock.mock.calls[0]
		expect(init).not.toHaveProperty('untracked')
		expect(init?.headers).toEqual({ 'Content-Type': 'application/json', 'X-Test': '1' })
	})
})
