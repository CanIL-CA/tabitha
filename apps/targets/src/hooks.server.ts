import { building } from '$app/env'
import { PUBLIC_CORS_ALLOW_LOCALHOST, PUBLIC_RATE_LIMIT_DISABLED } from '$app/env/public'
import { create_cors_handle } from '@tabitha/cors'
import { with_timeout } from '@tabitha/d1'
import { noindex_handle } from '@tabitha/noindex'
import { create_rate_limit_handle } from '@tabitha/rate-limit'
import type { TargetProject } from '@tabitha/types/target'
import { sequence, type Handle } from '@sveltejs/kit/hooks'
import { env } from 'cloudflare:workers'

const cors_handle = create_cors_handle({ allow_localhost: Boolean(PUBLIC_CORS_ALLOW_LOCALHOST) })
const rate_limit_handle = create_rate_limit_handle({ env, disabled: Boolean(PUBLIC_RATE_LIMIT_DISABLED) })

// Only routes under [project=valid_project] need a database -- the project's own binding, per
// TARGET_PROJECTS. Routes outside that segment (e.g. the project-list endpoint) don't set locals.db.
const db_config_handle: Handle = async function db_config_handle({ event, resolve }) {
	const project = event.params.project as TargetProject | undefined
	if (project) {
		const binding = `DB_Targets_${project}` as const
		const db = env[binding]
		if (!db && !building) {
			throw new Error(`database missing from env for project "${project}" (expected binding "${binding}")`)
		}

		event.locals.db = db && with_timeout({ db: db.withSession() })
	}

	return resolve(event)
}

export const handle = sequence(noindex_handle, cors_handle, rate_limit_handle, db_config_handle)
