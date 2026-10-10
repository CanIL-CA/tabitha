import { AUTH_SECRET, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, OAUTH_REDIRECT_PROXY_URL } from '$env/static/private'
import { PUBLIC_CORS_ALLOW_LOCALHOST, PUBLIC_RATE_LIMIT_DISABLED } from '$env/static/public'
import { is_authorized } from '#lib/server/auth.js'
import { resolve_redirect_proxy_url } from '#lib/server/redirect_proxy.js'
import { create_cors_handle } from '@tabitha/cors'
import { noindex_handle } from '@tabitha/noindex'
import { create_rate_limit_handle } from '@tabitha/rate-limit'
import { SvelteKitAuth } from '@auth/sveltekit'
import Google from '@auth/sveltekit/providers/google'
import { error, type Handle, type RequestEvent } from '@sveltejs/kit'
import { sequence } from '@sveltejs/kit/hooks'

const cors_handle = create_cors_handle({ allow_localhost: Boolean(PUBLIC_CORS_ALLOW_LOCALHOST) })

// /protected/* already requires a signed-in, authorized session (see authz_handle below), and
// /auth/* is the Auth.js sign-in flow itself -- neither needs the public-read-API throttle.
const rate_limit_handle = create_rate_limit_handle({
	skip_path_prefixes: ['/protected', '/auth'],
	disabled: Boolean(PUBLIC_RATE_LIMIT_DISABLED),
})

const db_config_handle: Handle = async function db_config_handle({ event, resolve }) {
	if (!event.platform?.env.DB_Ontology) {
		console.error('Database binding DB_Ontology is missing from platform environment.')
		throw error(500, 'Database configuration error: DB_Ontology binding is missing.')
	}

	event.locals.db_ontology = event.platform.env.DB_Ontology.withSession()
	event.locals.db_auth = event.platform.env.DB_Auth.withSession()

	return resolve(event)
}

// https://authjs.dev/reference/sveltekit#lazy-initialization
const { handle: authn_handle } = SvelteKitAuth(initialize_config)

async function initialize_config(event: RequestEvent) {
	const clientId = event.platform?.env.GOOGLE_OAUTH_CLIENT_ID || GOOGLE_OAUTH_CLIENT_ID
	const clientSecret = event.platform?.env.GOOGLE_OAUTH_CLIENT_SECRET || GOOGLE_OAUTH_CLIENT_SECRET
	const secret = event.platform?.env.AUTH_SECRET || AUTH_SECRET

	/**
	 * GOOGLE OAUTH REDIRECT PROXY FOR PREVIEW ENVIRONMENTS:
	 * Google OAuth 2.0 strictly disallows wildcards in Authorized Redirect URIs (RFC 6749 security restriction).
	 * Each PR gets its own Worker Preview host (`pr-<N>.ontology.tabitha.bible`, see
	 * docs/decisions/0020-per-pr-worker-previews.md), so none of them can be registered ahead of time.
	 *
	 * Setting `redirectProxyUrl` to `https://ontology.tabitha.bible/auth`:
	 * - On a Preview (`pr-<N>.ontology.tabitha.bible`): Auth.js sees it is not on the proxy host, so it sends
	 *   `redirect_uri = https://ontology.tabitha.bible/auth/callback/google` to Google.
	 * - On Production (`ontology.tabitha.bible`): Auth.js sees `url.origin === redirectProxyUrl.origin` and sets
	 *   `isOnRedirectProxy = true`, allowing production to receive the OAuth callback, decrypt the state, and
	 *   forward the user back to the preview deployment. That only works because Previews share
	 *   production's AUTH_SECRET and Google client (see the `previews` block in wrangler.jsonc).
	 *
	 * OAUTH_REDIRECT_PROXY_URL holds this value in `.env` for production, and as a runtime var in
	 * wrangler.jsonc's `previews` block for Previews (CI builds them with setup:env's `.env.local`, which
	 * blanks the build-time value). Local dev gets neither, so Auth.js uses its own no-proxy default.
	 */
	const redirectProxyUrl = resolve_redirect_proxy_url({ runtime: event.platform?.env.OAUTH_REDIRECT_PROXY_URL, build: OAUTH_REDIRECT_PROXY_URL })

	return {
		providers: [
			Google({ clientId, clientSecret }),
		],

		secret,
		trustHost: true,
		redirectProxyUrl,
	}
}

const authz_handle: Handle = async function authz_handle({ event, resolve }) {
	await authz(event)

	return resolve(event)

	async function authz(event: RequestEvent) {
		const AUTH_ERROR_MESSAGE = 'You must be signed in and have permission to access this page'
		const { route, locals } = event

		const session = await locals.auth()
		locals.user = session?.user

		if (route.id?.startsWith('/protected')) {
			if (!await is_authorized({ locals, permission: 'PROTECTED_ACCESS' })) {
				throw error(401, AUTH_ERROR_MESSAGE)
			}
		}
	}
}

export const handle = sequence(noindex_handle, cors_handle, rate_limit_handle, db_config_handle, authn_handle, authz_handle)
