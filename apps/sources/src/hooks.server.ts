import { building } from '$app/env'
import { AUTH_COOKIE_DOMAIN, BETTER_AUTH_SECRET, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, OAUTH_REDIRECT_PROXY_URL } from '$app/env/private'
import { PUBLIC_CORS_ALLOW_LOCALHOST, PUBLIC_ONTOLOGY_API_HOST, PUBLIC_RATE_LIMIT_DISABLED, PUBLIC_SERVICE_BINDINGS_DISABLED, PUBLIC_TARGETS_API_HOST } from '$app/env/public'
import { get_user_info } from '#lib/server/auth.js'
import { SOURCES_AUTH_SETTINGS } from '#lib/server/better_auth.js'
import { use_service_bindings } from '@tabitha/api-client'
import { create_auth, type Auth } from '@tabitha/auth'
import { create_cors_handle } from '@tabitha/cors'
import { with_timeout } from '@tabitha/d1'
import { noindex_handle } from '@tabitha/noindex'
import { create_rate_limit_handle } from '@tabitha/rate-limit'
import { error } from '@sveltejs/kit'
import { sequence, type Handle } from '@sveltejs/kit/hooks'
import { env } from 'cloudflare:workers'
import { svelteKitHandler } from 'better-auth/svelte-kit'

use_service_bindings({
	routes: [
		{ base_url: PUBLIC_ONTOLOGY_API_HOST, binding: env.ONTOLOGY },
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
	if (!env.DB_Sources) {
		if (!building) {
			throw new Error('database missing from env: DB_Sources')
		}
	}

	// putting it on `locals` to clean up usage in routes
	event.locals.db = env.DB_Sources && with_timeout({ db: env.DB_Sources.withSession() })
	event.locals.db_auth = env.DB_Auth && with_timeout({ db: env.DB_Auth.withSession() })

	return resolve(event)
}

// Bindings and secrets only exist per request, so the instance is built on the first one and reused
// for the life of the isolate.
let auth: Auth | undefined

function get_auth(): Auth {
	auth ??= create_auth({
		...SOURCES_AUTH_SETTINGS,
		db_auth: with_timeout({ db: env.DB_Auth }),
		secret: env.BETTER_AUTH_SECRET || BETTER_AUTH_SECRET,
		google_client_id: env.GOOGLE_OAUTH_CLIENT_ID || GOOGLE_OAUTH_CLIENT_ID,
		google_client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET || GOOGLE_OAUTH_CLIENT_SECRET,
		oauth_proxy_url: OAUTH_REDIRECT_PROXY_URL || undefined,
		cookie_domain: AUTH_COOKIE_DOMAIN || undefined,
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
			...await get_user_info({ db_auth: event.locals.db_auth, email: session.user.email }),
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
