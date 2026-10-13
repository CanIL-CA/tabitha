import { building } from '$app/environment'
import { PUBLIC_CORS_ALLOW_LOCALHOST, PUBLIC_RATE_LIMIT_DISABLED } from '$env/static/public'
import { create_cors_handle } from '@tabitha/cors'
import { noindex_handle } from '@tabitha/noindex'
import { create_rate_limit_handle } from '@tabitha/rate-limit'
import type { Handle } from '@sveltejs/kit'
import { sequence } from '@sveltejs/kit/hooks'

const cors_handle = create_cors_handle({ allow_localhost: Boolean(PUBLIC_CORS_ALLOW_LOCALHOST) })
const rate_limit_handle = create_rate_limit_handle({ disabled: Boolean(PUBLIC_RATE_LIMIT_DISABLED) })

const db_config_handle: Handle = async function db_config_handle({ event, resolve }) {
	if (!event.platform?.env.DB_Sources) {
		if (!building) {
			throw new Error(`database missing from platform arg: ${JSON.stringify(event.platform)}`)
		}
	}

	// putting it on `locals` to clean up usage in routes
	// @ts-expect-error until local bindings issue resolved
	event.locals.db = event.platform?.env.DB_Sources?.withSession()

	return resolve(event)
}

export const handle = sequence(noindex_handle, cors_handle, rate_limit_handle, db_config_handle)
