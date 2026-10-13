import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { oAuthProxy } from 'better-auth/plugins/oauth-proxy'
import type { D1Database } from '@cloudflare/workers-types'

// Production, every per-PR Preview (docs/decisions/0020-per-pr-worker-previews.md) and local dev.
// Better Auth also trusts each one as an origin, so production can send a proxied sign-in back to a Preview.
const ALLOWED_HOSTS = ['ontology.tabitha.bible', 'pr-*.ontology.tabitha.bible', 'localhost:3056']

type AuthSettings = {
	/** The D1 binding itself, not a `withSession()` session: Better Auth recognizes D1 by its `exec()`. */
	readonly db_auth: D1Database
	readonly secret: string
	readonly google_client_id: string
	readonly google_client_secret: string
	/** Production's origin, or none for local dev, which signs in through its own Google client. */
	readonly oauth_proxy_url?: string
}

/**
 * Better Auth's configuration, shared by the app and e2e's test-only instance (e2e/auth.setup.ts)
 * so that cookies minted in tests match what the app reads.
 */
export function create_auth_options({ db_auth, secret, google_client_id, google_client_secret, oauth_proxy_url }: AuthSettings) {
	return {
		baseURL: { allowedHosts: ALLOWED_HOSTS },
		basePath: '/auth',
		secret,
		database: db_auth,
		socialProviders: {
			google: { clientId: google_client_id, clientSecret: google_client_secret },
		},
		account: { encryptOAuthTokens: true },
		// Sessions don't record IP addresses (apps/www's privacy policy says so). That also turns off
		// Better Auth's own IP-keyed rate limiter, which is in-memory per isolate on Workers anyway;
		// the only auth routes are Google sign-in, its callback, get-session and sign-out.
		advanced: { ipAddress: { disableIpTracking: true } },
		/**
		 * Google rejects wildcard redirect URIs, so a Preview can't register its own callback. With the proxy,
		 * a Preview sends production's callback URL to Google; production exchanges the code and forwards
		 * the encrypted profile back to the Preview, which creates the session. That only works because
		 * Previews share production's BETTER_AUTH_SECRET and Google client (see wrangler.jsonc's `previews`).
		 */
		plugins: oauth_proxy_url ? [oAuthProxy({ productionURL: oauth_proxy_url })] : [],
	} satisfies BetterAuthOptions
}

export function create_auth(settings: AuthSettings) {
	return betterAuth(create_auth_options(settings))
}

export type Auth = ReturnType<typeof create_auth>
