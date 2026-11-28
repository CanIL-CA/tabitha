import type { AuthSettings } from '@tabitha/auth'

/** Sources' hosts for the shared Better Auth configuration (ADR 0027): production, its Previews, and local dev. */
export const SOURCES_AUTH_SETTINGS = {
	allowed_hosts: ['sources.tabitha.bible', 'pr-*.sources.tabitha.bible', 'localhost:1947'],
} as const satisfies Pick<AuthSettings, 'allowed_hosts'>
