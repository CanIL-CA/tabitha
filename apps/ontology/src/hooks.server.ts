import { BETTER_AUTH_SECRET, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, OAUTH_REDIRECT_PROXY_URL } from '$env/static/private'
import { PUBLIC_CORS_ALLOW_LOCALHOST, PUBLIC_RATE_LIMIT_DISABLED } from '$env/static/public'
import { building } from '$app/environment'
import { is_authorized } from '#lib/server/auth.js'
import { create_auth, type Auth } from '#lib/server/better_auth.js'
import { resolve_redirect_proxy_url } from '#lib/server/redirect_proxy.js'
import { create_cors_handle } from '@tabitha/cors'
import { noindex_handle } from '@tabitha/noindex'
import { create_rate_limit_handle } from '@tabitha/rate-limit'
import { error, type Handle, type RequestEvent } from '@sveltejs/kit'
import { sequence } from '@sveltejs/kit/hooks'
import { svelteKitHandler } from 'better-auth/svelte-kit'

const cors_handle = create_cors_handle({ allow_localhost: Boolean(PUBLIC_CORS_ALLOW_LOCALHOST) })

// /protected/* already requires a signed-in, authorized session (see authz_handle below), and
// /auth/* is Better Auth's sign-in flow itself -- neither needs the public-read-API throttle.
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

// Bindings and secrets only exist per request, so the instance is built on the first one and reused
// for the life of the isolate.
let auth: Auth | undefined

function get_auth(event: RequestEvent): Auth {
	const env = event.platform?.env

	auth ??= create_auth({
		db_auth: env!.DB_Auth,
		secret: env?.BETTER_AUTH_SECRET || BETTER_AUTH_SECRET,
		google_client_id: env?.GOOGLE_OAUTH_CLIENT_ID || GOOGLE_OAUTH_CLIENT_ID,
		google_client_secret: env?.GOOGLE_OAUTH_CLIENT_SECRET || GOOGLE_OAUTH_CLIENT_SECRET,
		oauth_proxy_url: resolve_redirect_proxy_url({ runtime: env?.OAUTH_REDIRECT_PROXY_URL, build: OAUTH_REDIRECT_PROXY_URL }),
	})

	return auth
}

// https://www.better-auth.com/docs/integrations/svelte-kit
const authn_handle: Handle = async function authn_handle({ event, resolve }) {
	const auth = get_auth(event)

	const session = await auth.api.getSession({ headers: event.request.headers })
	event.locals.user = session?.user

	return svelteKitHandler({ event, resolve, auth, building })
}

const authz_handle: Handle = async function authz_handle({ event, resolve }) {
	const AUTH_ERROR_MESSAGE = 'You must be signed in and have permission to access this page'

	if (event.route.id?.startsWith('/protected') && !await is_authorized({ locals: event.locals, permission: 'PROTECTED_ACCESS' })) {
		throw error(401, AUTH_ERROR_MESSAGE)
	}

	return resolve(event)
}

export const handle = sequence(noindex_handle, cors_handle, rate_limit_handle, db_config_handle, authn_handle, authz_handle)
