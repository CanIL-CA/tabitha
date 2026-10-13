import { building } from '$app/environment'
import { PUBLIC_CORS_ALLOW_LOCALHOST, PUBLIC_RATE_LIMIT_DISABLED } from '$env/static/public'
import { create_cors_handle } from '@tabitha/cors'
import { noindex_handle } from '@tabitha/noindex'
import { create_rate_limit_handle } from '@tabitha/rate-limit'
import type { TargetProject } from '@tabitha/types/target'
import type { D1Database } from '@cloudflare/workers-types'
import type { Handle } from '@sveltejs/kit'
import { sequence } from '@sveltejs/kit/hooks'

const cors_handle = create_cors_handle({ allow_localhost: Boolean(PUBLIC_CORS_ALLOW_LOCALHOST) })
const rate_limit_handle = create_rate_limit_handle({ disabled: Boolean(PUBLIC_RATE_LIMIT_DISABLED) })

// Only routes under [project=valid_project] need a database -- the project's own binding, per
// TARGET_PROJECTS. Routes outside that segment (e.g. the project-list endpoint) don't set locals.db.
const db_config_handle: Handle = async function db_config_handle({ event, resolve }) {
	const project = event.params.project as TargetProject | undefined
	if (project) {
		const binding = `DB_Targets_${project}` as const
		const db = event.platform?.env[binding]
		if (!db && !building) {
			throw new Error(`database missing from platform arg for project "${project}" (expected binding "${binding}"): ${JSON.stringify(event.platform)}`)
		}

		event.locals.db = (db?.withSession ? db.withSession() : db) as unknown as D1Database
	}

	return resolve(event)
}

export const handle = sequence(noindex_handle, cors_handle, rate_limit_handle, db_config_handle)
