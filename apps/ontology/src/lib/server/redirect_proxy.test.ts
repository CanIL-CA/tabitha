import { describe, expect, it } from 'vitest'
import { resolve_redirect_proxy_url } from './redirect_proxy'

const PROXY = 'https://ontology.tabitha.bible/auth'

describe('resolve_redirect_proxy_url', () => {
	it('uses the runtime var when the build-time value is blank, as in a CI-built Preview', () => {
		// CI's setup:env writes .env.local with OAUTH_REDIRECT_PROXY_URL forced blank, and Vite loads it
		// over .env, so a Preview built in CI bakes in an empty value.
		expect(resolve_redirect_proxy_url({ runtime: PROXY, build: '' })).toBe(PROXY)
	})

	it('falls back to the build-time value, as in production', () => {
		expect(resolve_redirect_proxy_url({ runtime: undefined, build: PROXY })).toBe(PROXY)
	})

	it('uses no proxy when neither is set, as in local dev', () => {
		expect(resolve_redirect_proxy_url({ runtime: undefined, build: '' })).toBeUndefined()
	})
})
