import { describe, expect, it } from 'vitest'
import type { D1Database } from '@cloudflare/workers-types'
import { create_auth_options } from './better_auth'

const SETTINGS = {
	db_auth: {} as D1Database,
	secret: 'secret',
	google_client_id: 'client-id',
	google_client_secret: 'client-secret',
}

describe('create_auth_options', () => {
	it('signs in through the OAuth proxy when given a production URL, as on production and Previews', () => {
		const { plugins } = create_auth_options({ ...SETTINGS, oauth_proxy_url: 'https://ontology.tabitha.bible' })

		expect(plugins.map(plugin => plugin.id)).toEqual(['oauth-proxy'])
	})

	it('uses no proxy without one, as in local dev', () => {
		const { plugins } = create_auth_options(SETTINGS)

		expect(plugins).toEqual([])
	})

	it("records no IP addresses, as apps/www's privacy policy promises", () => {
		expect(create_auth_options(SETTINGS).advanced.ipAddress.disableIpTracking).toBe(true)
	})

	it("keeps Better Auth under /auth, the path of Google's registered callback", () => {
		expect(create_auth_options(SETTINGS).basePath).toBe('/auth')
	})
})
