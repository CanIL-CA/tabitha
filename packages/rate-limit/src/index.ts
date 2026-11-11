import type { Handle } from '@sveltejs/kit/hooks'
import type { RateLimit } from '@cloudflare/workers-types'

// The binding normally answers in well under a millisecond. Requests hung at one colo with no CPU
// time and no error, so a stalled call must not hold every request behind it.
const RATE_LIMIT_TIMEOUT_MS = 2000

type EnforceRateLimitOptions = {
	readonly rate_limiter: RateLimit
	readonly key: string
	readonly timeout_ms?: number
}

type LimitOutcome = { readonly success: boolean } | 'timed_out'

function limit_or_time_out({ rate_limiter, key, timeout_ms }: Required<EnforceRateLimitOptions>): Promise<LimitOutcome> {
	let timer: ReturnType<typeof setTimeout> | undefined
	const timeout = new Promise<'timed_out'>(resolve => {
		timer = setTimeout(() => resolve('timed_out'), timeout_ms)
	})

	return Promise.race([rate_limiter.limit({ key }), timeout]).finally(() => clearTimeout(timer))
}

// Allows the request when the binding doesn't answer in time: rate limiting is abuse protection, not access control.
export async function enforce_rate_limit({ rate_limiter, key, timeout_ms = RATE_LIMIT_TIMEOUT_MS }: EnforceRateLimitOptions): Promise<Response | null> {
	const outcome = await limit_or_time_out({ rate_limiter, key, timeout_ms })
	if (outcome === 'timed_out') {
		console.error(`Rate limiter did not answer within ${timeout_ms} ms; allowing the request.`)
		return null
	}

	if (outcome.success) return null

	return new Response(JSON.stringify({ error: 'Too many requests. Please slow down and try again shortly.' }), {
		status: 429,
		headers: {
			'content-type': 'application/json',
			'retry-after': '60',
		},
	})
}

// Every app wires this binding under the same name, so a narrow structural
// type is enough here without depending on any single app's generated Env.
type RateLimiterEnv = {
	readonly RATE_LIMITER?: RateLimit
}

type CreateRateLimitHandleOptions = {
	// The app's `env` from `cloudflare:workers`, read on each request rather than when the handle is
	// created, since the binding is only reachable while a request is being handled.
	readonly env: RateLimiterEnv
	readonly skip_path_prefixes?: readonly string[]
	// Local dev and CI run fast, unpaced automated request bursts (a full e2e suite, a dev
	// reloading a page repeatedly) that routinely exceed a threshold meant for real-world abuse.
	// Callers pass this from a public env var, the same way @tabitha/cors's allow_localhost works.
	readonly disabled?: boolean
}

export function create_rate_limit_handle({
	env,
	skip_path_prefixes = [],
	disabled = false,
}: CreateRateLimitHandleOptions): Handle {
	return async function rate_limit_handle({ event, resolve }) {
		if (disabled) return resolve(event)

		const { pathname } = new URL(event.request.url)
		if (skip_path_prefixes.some(prefix => pathname.startsWith(prefix))) {
			return resolve(event)
		}

		const rate_limiter = env.RATE_LIMITER
		if (!rate_limiter) {
			console.error('RATE_LIMITER binding is missing from env.')
			return resolve(event)
		}

		// Cloudflare's edge sets cf-connecting-ip on every public request, so only a sibling app's
		// service binding call arrives without one, and that app has already rate limited its user
		const client_address = event.getClientAddress()
		if (!client_address) return resolve(event)

		const limited = await enforce_rate_limit({ rate_limiter, key: client_address })
		return limited ?? resolve(event)
	}
}
