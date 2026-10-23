import type { Handle } from '@sveltejs/kit/hooks'

const PROD_ALLOWED_ORIGIN_PATTERN = String.raw`\.tabitha\.bible(:\d+)?$`
const PREVIEW_ALLOWED_ORIGIN_PATTERN = String.raw`\.tbta\.workers\.dev(:\d+)?$`
const LOCALHOST_ORIGIN_PATTERN = String.raw`^https?://(localhost|127\.0\.0\.1)(:\d+)?$`

const PREFLIGHT_ALLOWED_METHODS = 'GET, HEAD, POST, OPTIONS'

type AllowedOriginOptions = {
	readonly origin: string | null
	readonly allow_localhost: boolean
}

export function get_cors_allowed_origin({ origin, allow_localhost }: AllowedOriginOptions): string | null {
	if (!origin) return null
	if (origin.match(PROD_ALLOWED_ORIGIN_PATTERN)) return origin
	if (origin.match(PREVIEW_ALLOWED_ORIGIN_PATTERN)) return origin
	if (allow_localhost && origin.match(LOCALHOST_ORIGIN_PATTERN)) return origin
	return null
}

type CreateCorsHandleOptions = {
	readonly allow_localhost: boolean
}

export function create_cors_handle({ allow_localhost }: CreateCorsHandleOptions): Handle {
	return async function cors_handle({ event, resolve }) {
		const origin = event.request.headers.get('Origin')
		const allowed_origin = get_cors_allowed_origin({ origin, allow_localhost })

		// Endpoints export only the verbs they serve, so a browser's preflight would otherwise get a 405.
		if (allowed_origin && is_preflight(event.request)) {
			return new Response(null, { status: 204, headers: preflight_headers({ request: event.request, allowed_origin }) })
		}

		const response = await resolve(event)
		if (allowed_origin) {
			response.headers.set('Access-Control-Allow-Origin', allowed_origin)
		}

		return response
	}
}

function is_preflight(request: Request): boolean {
	return request.method === 'OPTIONS' && request.headers.has('Access-Control-Request-Method')
}

type PreflightHeadersOptions = {
	readonly request: Request
	readonly allowed_origin: string
}

function preflight_headers({ request, allowed_origin }: PreflightHeadersOptions): Headers {
	const headers = new Headers({
		'Access-Control-Allow-Origin': allowed_origin,
		'Access-Control-Allow-Methods': PREFLIGHT_ALLOWED_METHODS,
		'Vary': 'Origin, Access-Control-Request-Headers',
	})
	const requested_headers = request.headers.get('Access-Control-Request-Headers')
	if (requested_headers) headers.set('Access-Control-Allow-Headers', requested_headers)
	return headers
}
