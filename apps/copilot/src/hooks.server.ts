import { sequence, type Handle, type ServerInit } from '@sveltejs/kit/hooks'
import { create_ai_client, type AiClient } from '@tabitha/ai'
import { create_cors_handle } from '@tabitha/cors'
import { noindex_handle } from '@tabitha/noindex'
import { create_rate_limit_handle } from '@tabitha/rate-limit'
import { PUBLIC_CORS_ALLOW_LOCALHOST, PUBLIC_RATE_LIMIT_DISABLED } from '$app/env/public'
import { AI_GATEWAY_TOKEN, CLOUDFLARE_ACCOUNT_ID, GEMINI_LOCATION, GEMINI_PROJECT_ID } from '$app/env/private'
import { paraglideMiddleware } from '#lib/paraglide/server.js'
import { env } from 'cloudflare:workers'

let ai: AiClient

export const init: ServerInit = async () => {
	ai = create_ai_client({
		app: 'copilot',
		feature: 'copilot',
		gateway: {
			account_id: CLOUDFLARE_ACCOUNT_ID,
			token: AI_GATEWAY_TOKEN,
			project: GEMINI_PROJECT_ID,
			location: GEMINI_LOCATION,
		},
	})
}

const cors_handle = create_cors_handle({ allow_localhost: Boolean(PUBLIC_CORS_ALLOW_LOCALHOST) })

const rate_limit_handle = create_rate_limit_handle({ env, disabled: Boolean(PUBLIC_RATE_LIMIT_DISABLED) })

const ai_locals_handle: Handle = async function ai_locals_handle({ event, resolve }) {
	event.locals.ai = ai
	return resolve(event)
}

const i18n_handle: Handle = function i18n_handle({ event, resolve }) {
	// URLs carry no locale (see PARAGLIDE_OPTIONS), so the middleware's request is the same one; only
	// the locale it detects is needed, and SvelteKit 3 doesn't let a handle replace event.request.
	return paraglideMiddleware(event.request, ({ locale }) => {
		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale),
		})
	})
}

export const handle = sequence(noindex_handle, cors_handle, rate_limit_handle, ai_locals_handle, i18n_handle)
