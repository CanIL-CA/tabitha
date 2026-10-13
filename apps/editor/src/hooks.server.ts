import { PUBLIC_CORS_ALLOW_LOCALHOST, PUBLIC_RATE_LIMIT_DISABLED } from '$env/static/public'
import { create_cors_handle } from '@tabitha/cors'
import { noindex_handle } from '@tabitha/noindex'
import { create_rate_limit_handle } from '@tabitha/rate-limit'
import { sequence } from '@sveltejs/kit/hooks'

const cors_handle = create_cors_handle({ allow_localhost: Boolean(PUBLIC_CORS_ALLOW_LOCALHOST) })
const rate_limit_handle = create_rate_limit_handle({ disabled: Boolean(PUBLIC_RATE_LIMIT_DISABLED) })

export const handle = sequence(noindex_handle, cors_handle, rate_limit_handle)
