/**
 * Thrown for any failure to get a usable response out of the model -- an empty response, a
 * response that doesn't parse as the requested JSON schema, or the AI Gateway rejecting/failing
 * the request itself (auth, rate limit, network error). Replaces the four divergent hand-rolled
 * failure modes the individual call sites had before this package existed. Call sites that catch
 * this to fail soft (e.g. ontology's semantic search) are relying on it covering gateway-level
 * failures too, not just model-quality ones -- the full detail for any of these is logged via
 * `console.error` where it's thrown, for Cloudflare Observability to pick up.
 */
export class AiResponseError extends Error {
	override name = 'AiResponseError'
}
