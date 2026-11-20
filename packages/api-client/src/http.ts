import { clean_trailing_slash } from '@tabitha/types/patterns'
import { tracked } from './request_tracking'
import { find_service_fetch } from './service_bindings'

export type ClientOptions = {
	base_url: string
	fetch?: typeof fetch
	/** Enable or disable client caching (defaults to false). */
	cache?: boolean
}

export type RequestOptions = RequestInit & {
	/** Keeps the request out of the UI's "taking longer than usual" notice, for calls that are slow by design (e.g. AI). */
	untracked?: boolean
}

export type GetOptions = RequestOptions & {
	/** Query string values, encoded in one place. Entries that are `undefined` are left out. */
	params?: Record<string, string | undefined>
}

export type HttpClient = {
	get: <T>(path: string, init?: GetOptions) => Promise<T | null>
	post: <T>(path: string, body?: unknown, init?: RequestOptions) => Promise<T | null>
}

const DEFAULT_CACHE_TAG = '1'

// A 429 doesn't mean "no data" -- it means the server didn't even look. Retrying a couple of
// times (honoring whatever Retry-After the server sends, whatever that value happens to be)
// lets a transient throttle resolve itself instead of being silently swallowed into an empty
// result by parse_response below. The cap on the wait keeps a single interactive request from
// hanging for a long time when the server asks for a long backoff; if retries are exhausted the
// caller falls back to today's behavior (null / empty result).
const MAX_RATE_LIMIT_RETRIES = 3
const MAX_RETRY_DELAY_MS = 4_000
const FALLBACK_RETRY_DELAY_MS = 500

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

function get_retry_delay_ms({ res, attempt }: {
	res: Response
	attempt: number
}): number {
	const retry_after = Number(res.headers?.get?.('retry-after'))
	const requested_delay_ms = Number.isFinite(retry_after) && retry_after > 0
		? retry_after * 1000
		: FALLBACK_RETRY_DELAY_MS * 2 ** attempt

	return Math.min(requested_delay_ms, MAX_RETRY_DELAY_MS)
}

// Cloudflare has left requests to a sibling Worker hanging for minutes with no response at all, while
// the same request sent again a moment later succeeded. A wait this long means the request is lost,
// not slow: no read endpoint takes more than a few seconds, and D1 queries time out at 15 s.
const RESPONSE_TIMEOUT_MS = 20_000
const RESPONSE_ATTEMPTS = 2

type SendRequest = (signal: AbortSignal) => Promise<Response>

class ResponseTimeoutError extends Error {}

type FetchWithTimeoutOptions = {
	readonly send: SendRequest
	readonly url: string
	readonly timeout_ms: number
}

// Covers only the wait for response headers, so a streamed body can take as long as it needs
async function fetch_with_timeout({ send, url, timeout_ms }: FetchWithTimeoutOptions): Promise<Response> {
	const controller = new AbortController()
	let timer: ReturnType<typeof setTimeout> | undefined
	const timeout = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			const error = new ResponseTimeoutError(`[api-client] no response from ${url} within ${timeout_ms} ms`)
			controller.abort(error)
			reject(error)
		}, timeout_ms)
	})

	// The race ends the wait even if a fetch implementation ignores the abort signal
	return Promise.race([send(controller.signal), timeout]).finally(() => clearTimeout(timer))
}

async function fetch_with_timeout_retry({ send, url, timeout_ms }: FetchWithTimeoutOptions): Promise<Response> {
	for (let attempt = 1; ; attempt++) {
		try {
			return await fetch_with_timeout({ send, url, timeout_ms })
		} catch (error) {
			if (!(error instanceof ResponseTimeoutError) || attempt >= RESPONSE_ATTEMPTS) throw error
			console.warn(`${error.message}; sending it again`)
		}
	}
}

async function fetch_with_rate_limit_retry(do_fetch: () => Promise<Response>): Promise<Response> {
	let res = await do_fetch()

	for (let attempt = 0; res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES; attempt++) {
		await sleep(get_retry_delay_ms({ res, attempt }))
		res = await do_fetch()
	}

	return res
}

/**
 * Creates a centralized HTTP client for API consumers.
 *
 * Automatically handles:
 * - Base URL normalization (trailing slash trimming)
 * - Declarative caching (`cache: true`) via transparent GET query parameter injection
 * - JSON body serialization and Content-Type headers on POST requests
 * - MIME-type aware response dispatching (JSON, text, streams, binary)
 * - Built-in error checking (`!res.ok -> null`), logged via `console.warn` so failures aren't silent
 * - Bounded retry-with-backoff on 429 responses, honoring the server's Retry-After header
 * - One resend when no response arrives within RESPONSE_TIMEOUT_MS (except `untracked` calls, which are slow by design)
 */
export function create_http_client(options: ClientOptions): HttpClient {
	const { base_url, cache = false } = options
	const clean_base = clean_trailing_slash(base_url)
	// Resolved per call, since an app registers its bindings after its modules create their clients
	const get_fetch = () => options.fetch ?? find_service_fetch(clean_base) ?? globalThis.fetch

	function build_url({ path, params = {}, is_get = false }: {
		path: string
		params?: Record<string, string | undefined>
		is_get?: boolean
	}): string {
		const normalized_path = path.startsWith('/') ? path : `/${path}`
		const full_url = `${clean_base}${normalized_path}`
		const query = new URLSearchParams()
		for (const [name, value] of Object.entries(params)) {
			if (value !== undefined) query.set(name, value)
		}
		if (cache && is_get) query.set('v', DEFAULT_CACHE_TAG)
		if (!query.size) return full_url

		const separator = full_url.includes('?') ? '&' : '?'
		return `${full_url}${separator}${query}`
	}

	async function parse_response<T>(res: Response): Promise<T | null> {
		if (!res.ok) {
			console.warn(`[api-client] ${res.status} ${res.statusText} from ${res.url}`)
			return null
		}

		const content_type = res.headers?.get?.('content-type') ?? ''

		// 1. Streaming (SSE / streams)
		if (content_type.includes('text/event-stream')) {
			return res.body as T
		}

		// 2. Binary / Downloads (file downloads, audio, zip)
		if (
			content_type.includes('application/octet-stream') ||
			content_type.includes('application/zip') ||
			content_type.includes('audio/')
		) {
			return (await res.arrayBuffer()) as T
		}

		// 3. Plain text / Markdown / CSV
		if (
			content_type.includes('text/plain') ||
			content_type.includes('text/markdown') ||
			content_type.includes('text/csv')
		) {
			return (await res.text()) as T
		}

		// 4. Default: JSON
		try {
			return (await res.json()) as T
		} catch {
			console.warn(`[api-client] unparseable JSON response from ${res.url}`)
			return null
		}
	}

	type SendOptions = {
		readonly url: string
		readonly init: RequestInit
		readonly untracked?: boolean
	}

	async function send({ url, init, untracked }: SendOptions): Promise<Response> {
		if (untracked) return fetch_with_rate_limit_retry(() => Object.keys(init).length ? get_fetch()(url, init) : get_fetch()(url))

		const send_once: SendRequest = signal => get_fetch()(url, {
			...init,
			signal: init.signal ? AbortSignal.any([init.signal, signal]) : signal,
		})
		const request = fetch_with_rate_limit_retry(() => fetch_with_timeout_retry({ send: send_once, url, timeout_ms: RESPONSE_TIMEOUT_MS }))
		return tracked(request)
	}

	return {
		async get<T>(path: string, options?: GetOptions): Promise<T | null> {
			const { untracked, params, ...init } = options ?? {}
			const url = build_url({ path, params, is_get: true })
			const res = await send({ url, init: Object.keys(init).length ? { ...init, method: 'GET' } : {}, untracked })
			return parse_response<T>(res)
		},

		async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T | null> {
			const url = build_url({ path })
			const { untracked, ...init } = options ?? {}
			const res = await send({
				url,
				init: {
					...init,
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						...init.headers,
					},
					body: body !== undefined ? JSON.stringify(body) : undefined,
				},
				untracked,
			})
			return parse_response<T>(res)
		},
	}
}
