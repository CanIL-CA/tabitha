type RedirectProxySources = {
	/** The Worker's runtime var (`env.OAUTH_REDIRECT_PROXY_URL` from `cloudflare:workers`). */
	readonly runtime?: string
	/** The build-time value (`$app/env/private`, a static var). */
	readonly build: string
}

/**
 * Picks the OAuth proxy's production URL, or `undefined` for no proxy. The runtime var wins because a
 * Preview is built in CI, where setup:env's `.env.local` blanks the build-time value; the `previews`
 * block in wrangler.jsonc sets the runtime var instead. Production falls back to `.env`'s value, and
 * local dev has neither.
 */
export function resolve_redirect_proxy_url({ runtime, build }: RedirectProxySources): string | undefined {
	return runtime || build || undefined
}
