import { clean_trailing_slash } from '@tabitha/types/patterns'

export type ClientOptions = {
	base_url: string
	fetch?: typeof fetch
	/** Enable or disable client caching (defaults to false). */
	cache?: boolean
}

export type HttpClient = {
	get: <T>(path: string, init?: RequestInit) => Promise<T | null>
	post: <T>(path: string, body?: unknown, init?: RequestInit) => Promise<T | null>
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
 */
export function create_http_client(options: ClientOptions): HttpClient {
	const { base_url, cache = false } = options
	const clean_base = clean_trailing_slash(base_url)
	const get_fetch = () => options.fetch ?? globalThis.fetch

	function build_url({ path, is_get = false }: { path: string, is_get?: boolean }): string {
		const normalized_path = path.startsWith('/') ? path : `/${path}`
		const full_url = `${clean_base}${normalized_path}`
		if (!cache || !is_get) return full_url

		const separator = full_url.includes('?') ? '&' : '?'
		return `${full_url}${separator}v=${DEFAULT_CACHE_TAG}`
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

	return {
		async get<T>(path: string, init?: RequestInit): Promise<T | null> {
			const url = build_url({ path, is_get: true })
			const res = await fetch_with_rate_limit_retry(() =>
				init ? get_fetch()(url, { ...init, method: 'GET' }) : get_fetch()(url),
			)
			return parse_response<T>(res)
		},

		async post<T>(path: string, body?: unknown, init?: RequestInit): Promise<T | null> {
			const url = build_url({ path })
			const res = await fetch_with_rate_limit_retry(() => get_fetch()(url, {
				...init,
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...init?.headers,
				},
				body: body !== undefined ? JSON.stringify(body) : undefined,
			}))
			return parse_response<T>(res)
		},
	}
}
