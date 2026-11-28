import type { AuthSettings } from '@tabitha/auth'

/** Ontology's hosts for the shared Better Auth configuration (ADR 0027): production, its Previews, and local dev. */
export const ONTOLOGY_AUTH_SETTINGS = {
	allowed_hosts: ['ontology.tabitha.bible', 'pr-*.ontology.tabitha.bible', 'localhost:3056'],
} as const satisfies Pick<AuthSettings, 'allowed_hosts'>
