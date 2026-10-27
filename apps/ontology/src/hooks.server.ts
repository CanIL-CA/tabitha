import { BETTER_AUTH_SECRET, GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, OAUTH_REDIRECT_PROXY_URL } from '$app/env/private'
import { PUBLIC_CORS_ALLOW_LOCALHOST, PUBLIC_RATE_LIMIT_DISABLED, PUBLIC_SERVICE_BINDINGS_DISABLED, PUBLIC_SOURCES_API_HOST, PUBLIC_TARGETS_API_HOST } from '$app/env/public'
import { building, version } from '$app/env'
import { get_user_info } from '#lib/server/auth.js'
import { create_auth, type Auth } from '#lib/server/better_auth.js'
import { bookmark_cookie, read_bookmark } from '#lib/server/d1_bookmark.js'
import { use_service_bindings } from '@tabitha/api-client'
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

// With D1 read replication, each request starts from the browser's last bookmark, so it reads a
// replica at least as new as anything that browser saw or saved before, such as an editor's own edit.
// https://developers.cloudflare.com/d1/best-practices/read-replication/#start-a-session-from-previous-context-bookmark
const D1_BOOKMARK_COOKIE = 'd1_bookmark'

const db_config_handle: Handle = async function db_config_handle({ event, resolve }) {
	if (!env.DB_Ontology) {
		console.error('Database binding DB_Ontology is missing from env.')
		throw error(500, 'Database configuration error: DB_Ontology binding is missing.')
	}

	const saved_bookmark = read_bookmark({ cookie: event.cookies.get(D1_BOOKMARK_COOKIE), build: version })
	const ontology_session = env.DB_Ontology.withSession(saved_bookmark)
	event.locals.db_ontology = with_timeout({ db: ontology_session })
	event.locals.db_auth = with_timeout({ db: env.DB_Auth.withSession() })

	const response = await resolve(event)

	// cookies.set() is closed once resolve() has built the response, and the bookmark is only final now.
	// A failed request drops the bookmark, in case D1 rejected it (e.g. after a Time Travel restore),
	// so the next request starts fresh instead of failing the same way.
	if (saved_bookmark && response.status >= 500) {
		response.headers.append('set-cookie', event.cookies.serialize(D1_BOOKMARK_COOKIE, '', { path: '/', maxAge: 0 }))
		return response
	}

	const bookmark = ontology_session.getBookmark()
	if (bookmark && bookmark !== saved_bookmark) {
		response.headers.append('set-cookie', event.cookies.serialize(D1_BOOKMARK_COOKIE, bookmark_cookie({ bookmark, build: version }), { path: '/' }))
	}

	return response
}

// Bindings and secrets only exist per request, so the instance is built on the first one and reused
// for the life of the isolate.
let auth: Auth | undefined

function get_auth(): Auth {
	auth ??= create_auth({
		db_auth: with_timeout({ db: env.DB_Auth }),
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
