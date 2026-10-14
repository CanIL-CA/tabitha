import type { Handle } from '@sveltejs/kit/hooks'

const PROD_ALLOWED_ORIGIN_PATTERN = String.raw`\.tabitha\.bible(:\d+)?$`
const PREVIEW_ALLOWED_ORIGIN_PATTERN = String.raw`\.tbta\.workers\.dev(:\d+)?$`
const LOCALHOST_ORIGIN_PATTERN = String.raw`^https?://(localhost|127\.0\.0\.1)(:\d+)?$`

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
		const response = await resolve(event)

		const origin = event.request.headers.get('Origin')
		const allowed_origin = get_cors_allowed_origin({ origin, allow_localhost })
		if (allowed_origin) {
			response.headers.set('Access-Control-Allow-Origin', allowed_origin)
		}

		return response
	}
}
