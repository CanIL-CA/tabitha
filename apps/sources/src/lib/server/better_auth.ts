import type { AuthSettings } from '@tabitha/auth'

/**
 * Sources' part of the shared Better Auth configuration (ADR 0027), used by the app and by e2e's
 * test-only instance (e2e/support/sign_in.ts) so that cookies minted in tests match what the app reads.
 */
export const SOURCES_AUTH_SETTINGS = {
	allowed_hosts: ['sources.tabitha.bible', 'pr-*.sources.tabitha.bible', 'localhost:1947'],
	// Its own prefix, so signing in to Sources on localhost doesn't overwrite Ontology's cookie.
	cookie_prefix: 'sources',
} as const satisfies Pick<AuthSettings, 'allowed_hosts' | 'cookie_prefix'>
