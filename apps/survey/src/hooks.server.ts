import { building } from '$app/env'
import { PUBLIC_RATE_LIMIT_DISABLED } from '$app/env/public'
import { with_timeout } from '@tabitha/d1'
import { noindex_handle } from '@tabitha/noindex'
import { create_rate_limit_handle } from '@tabitha/rate-limit'
import { sequence, type Handle } from '@sveltejs/kit/hooks'
import { env } from 'cloudflare:workers'

const rate_limit_handle = create_rate_limit_handle({ env, disabled: Boolean(PUBLIC_RATE_LIMIT_DISABLED) })

const db_config_handle: Handle = async function db_config_handle({ event, resolve }) {
	if (!env.DB_Survey && !building) throw new Error('database missing from env (expected binding "DB_Survey")')
	event.locals.db = env.DB_Survey && with_timeout({ db: env.DB_Survey })
	return resolve(event)
}

export const handle = sequence(noindex_handle, rate_limit_handle, db_config_handle)
