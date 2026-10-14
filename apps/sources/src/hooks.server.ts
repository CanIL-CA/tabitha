import { building } from '$app/env'
import { PUBLIC_CORS_ALLOW_LOCALHOST, PUBLIC_RATE_LIMIT_DISABLED } from '$app/env/public'
import { create_cors_handle } from '@tabitha/cors'
import { noindex_handle } from '@tabitha/noindex'
import { create_rate_limit_handle } from '@tabitha/rate-limit'
import { sequence, type Handle } from '@sveltejs/kit/hooks'
import { env } from 'cloudflare:workers'

const cors_handle = create_cors_handle({ allow_localhost: Boolean(PUBLIC_CORS_ALLOW_LOCALHOST) })
const rate_limit_handle = create_rate_limit_handle({ env, disabled: Boolean(PUBLIC_RATE_LIMIT_DISABLED) })

const db_config_handle: Handle = async function db_config_handle({ event, resolve }) {
	if (!env.DB_Sources) {
		if (!building) {
			throw new Error('database missing from env: DB_Sources')
		}
	}

	// putting it on `locals` to clean up usage in routes
	event.locals.db = env.DB_Sources?.withSession()

	return resolve(event)
}

export const handle = sequence(noindex_handle, cors_handle, rate_limit_handle, db_config_handle)
