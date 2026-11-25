import type { AuthSettings } from '@tabitha/auth'

/**
 * Ontology's part of the shared Better Auth configuration (ADR 0027), used by the app and by e2e's
 * test-only instance (e2e/support/sign_in.ts) so that cookies minted in tests match what the app reads.
 */
export const ONTOLOGY_AUTH_SETTINGS = {
	allowed_hosts: ['ontology.tabitha.bible', 'pr-*.ontology.tabitha.bible', 'localhost:3056'],
	// Better Auth's own default, which Ontology's cookies already carried before ADR 0027 made the
	// prefix per app. Keeping it means nobody already signed in is signed out by the change.
	cookie_prefix: 'better-auth',
} as const satisfies Pick<AuthSettings, 'allowed_hosts' | 'cookie_prefix'>
