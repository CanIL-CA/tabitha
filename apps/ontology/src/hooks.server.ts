import { BETTER_AUTH_SECRET, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, OAUTH_REDIRECT_PROXY_URL } from '$app/env/private'
import { PUBLIC_CORS_ALLOW_LOCALHOST, PUBLIC_RATE_LIMIT_DISABLED, PUBLIC_SERVICE_BINDINGS_DISABLED, PUBLIC_SOURCES_API_HOST, PUBLIC_TARGETS_API_HOST } from '$app/env/public'
import { building } from '$app/env'
import { get_user_info } from '#lib/server/auth.js'
import { create_auth, type Auth } from '#lib/server/better_auth.js'
import { use_service_bindings } from '@tabitha/api-client'
import { create_cors_handle } from '@tabitha/cors'
import { noindex_handle } from '@tabitha/noindex'
import { create_rate_limit_handle } from '@tabitha/rate-limit'
import { error } from '@sveltejs/kit'
import { sequence, type Handle } from '@sveltejs/kit/hooks'
import { env } from 'cloudflare:workers'
import { svelteKitHandler } from 'better-auth/svelte-kit'

use_service_bindings({
	routes: [
		{ base_url: PUBLIC_SOURCES_API_HOST, binding: env.SOURCES },
		{ base_url: PUBLIC_TARGETS_API_HOST, binding: env.TARGETS },
	],
	disabled: Boolean(PUBLIC_SERVICE_BINDINGS_DISABLED),
})

const cors_handle = create_cors_handle({ allow_localhost: Boolean(PUBLIC_CORS_ALLOW_LOCALHOST) })

// /protected/* already requires a signed-in, authorized session (see authz_handle below), and
// /auth/* is Better Auth's sign-in flow itself -- neither needs the public-read-API throttle.
const rate_limit_handle = create_rate_limit_handle({
	env,
	skip_path_prefixes: ['/protected', '/auth'],
	disabled: Boolean(PUBLIC_RATE_LIMIT_DISABLED),
})

const db_config_handle: Handle = async function db_config_handle({ event, resolve }) {
	if (!env.DB_Ontology) {
		console.error('Database binding DB_Ontology is missing from env.')
		throw error(500, 'Database configuration error: DB_Ontology binding is missing.')
	}

	event.locals.db_ontology = env.DB_Ontology.withSession()
	event.locals.db_auth = env.DB_Auth.withSession()

	return resolve(event)
}

// Bindings and secrets only exist per request, so the instance is built on the first one and reused
// for the life of the isolate.
let auth: Auth | undefined

function get_auth(): Auth {
	auth ??= create_auth({
		db_auth: env.DB_Auth,
		secret: env.BETTER_AUTH_SECRET || BETTER_AUTH_SECRET,
		google_client_id: env.GOOGLE_OAUTH_CLIENT_ID || GOOGLE_OAUTH_CLIENT_ID,
		google_client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET || GOOGLE_OAUTH_CLIENT_SECRET,
		oauth_proxy_url: OAUTH_REDIRECT_PROXY_URL || undefined,
	})

	return auth
}

// https://www.better-auth.com/docs/integrations/svelte-kit
const authn_handle: Handle = async function authn_handle({ event, resolve }) {
	const auth = get_auth()

	const session = await auth.api.getSession({ headers: event.request.headers })
	if (session?.user.email) {
		event.locals.user = {
			email: session.user.email,
			name: session.user.name,
			...await get_user_info({ locals: event.locals, email: session.user.email }),
		}
	}

	return svelteKitHandler({ event, resolve, auth, building })
}

const authz_handle: Handle = async function authz_handle({ event, resolve }) {
	const AUTH_ERROR_MESSAGE = 'You must be signed in and have permission to access this page'

	if (event.route.id?.startsWith('/protected') && !event.locals.user?.permissions.has_protected_access) {
		throw error(401, AUTH_ERROR_MESSAGE)
	}

	return resolve(event)
}

export const handle = sequence(noindex_handle, cors_handle, rate_limit_handle, db_config_handle, authn_handle, authz_handle)
