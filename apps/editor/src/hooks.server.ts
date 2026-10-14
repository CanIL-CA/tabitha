import { PUBLIC_CORS_ALLOW_LOCALHOST, PUBLIC_ONTOLOGY_API_HOST, PUBLIC_RATE_LIMIT_DISABLED, PUBLIC_SERVICE_BINDINGS_DISABLED, PUBLIC_TARGETS_API_HOST } from '$app/env/public'
import { use_service_bindings } from '@tabitha/api-client'
import { create_cors_handle } from '@tabitha/cors'
import { noindex_handle } from '@tabitha/noindex'
import { create_rate_limit_handle } from '@tabitha/rate-limit'
import { sequence } from '@sveltejs/kit/hooks'
import { env } from 'cloudflare:workers'

use_service_bindings({
	routes: [
		{ base_url: PUBLIC_ONTOLOGY_API_HOST, binding: env.ONTOLOGY },
		{ base_url: PUBLIC_TARGETS_API_HOST, binding: env.TARGETS },
	],
	disabled: Boolean(PUBLIC_SERVICE_BINDINGS_DISABLED),
})

const cors_handle = create_cors_handle({ allow_localhost: Boolean(PUBLIC_CORS_ALLOW_LOCALHOST) })
const rate_limit_handle = create_rate_limit_handle({ env, disabled: Boolean(PUBLIC_RATE_LIMIT_DISABLED) })

export const handle = sequence(noindex_handle, cors_handle, rate_limit_handle)
