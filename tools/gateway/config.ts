/** Cloudflare AI Gateway config accepted by the create/update REST endpoints. Field names and
 * enum values are taken from Cloudflare's generated Go client (github.com/cloudflare/cloudflare-go,
 * ai_gateway/aigateway.go), since Cloudflare's public docs pages don't render their field list to
 * a plain HTTP fetch. This intentionally only lists the fields TaBiThA actually sets -- the API
 * accepts several more (dlp, guardrails, stripe, otel, spend_limits) that are left at their
 * Cloudflare-side defaults until there's a reason to set them.
 */
export type DesiredGatewayConfig = {
	cache_ttl: number
	cache_invalidate_on_update: boolean
	collect_logs: boolean
	authentication: boolean
	rate_limiting_interval: number
	rate_limiting_limit: number
	rate_limiting_technique: 'fixed' | 'sliding'
	retry_max_attempts: number
	retry_delay: number
	retry_backoff: 'constant' | 'linear' | 'exponential'
	// Only a valid field on the gateway *update* endpoint -- cloudflare-go's AIGatewayNewParams
	// (create) omits `guardrails`/`dlp` entirely, unlike AIGatewayUpdateParams. apply.ts strips
	// this from the create request and always follows a create with an update.
	guardrails: {
		prompt: Partial<Record<GuardrailCategory, 'FLAG' | 'BLOCK'>>
		response: Partial<Record<GuardrailCategory, 'FLAG' | 'BLOCK'>>
	}
}

/** Llama Guard 3's 13 hazard categories (`S1`-`S13`), plus Cloudflare's own `P1` for prompt
 * injection (not part of the Llama Guard taxonomy). A category left out of `guardrails.prompt`/
 * `.response` above is unenforced. */
type GuardrailCategory = 'P1' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | 'S8' | 'S9' | 'S10' | 'S11' | 'S12' | 'S13'

/** The gateway id -- also the path segment every app's Universal Endpoint URL routes through. */
export const gateway_id = 'tabitha'

export const desired_gateway_config: DesiredGatewayConfig = {
	// 1 hour; per-request `cf-aig-cache-ttl` can override this per call. `cf-aig-metadata` was
	// confirmed not to fragment this cache -- see ADR 0007's "Things to verify" section.
	cache_ttl: 3600,
	cache_invalidate_on_update: false,
	collect_logs: true,
	// Required for BYOK: without this, `cf-aig-authorization` isn't enforced, which defeats the
	// point of storing provider credentials gateway-side instead of app-side.
	authentication: true,
	rate_limiting_interval: 60,
	// No real per-app traffic to size this against yet -- generous placeholder, not a considered
	// limit. Retune once usage is measurable. See ADR 0007's rate-limit-isolation revisit trigger:
	// a single shared gateway means one app's burst can throttle another's.
	rate_limiting_limit: 6000,
	rate_limiting_technique: 'sliding',
	// Retries only fire on a failed attempt; @tabitha/ai's per-request `cf-aig-request-timeout`
	// is what makes a slow one fail. Its overall client timeout is sized for these 3 attempts, so
	// change the two together (packages/ai/src/client.ts).
	retry_max_attempts: 3,
	retry_delay: 500,
	retry_backoff: 'exponential',
	guardrails: {
		// Everything left unset -- the 13 content categories (S1-S13: violence, hate, self-harm,
		// sexual content, etc.) for the same reason as always: TaBiThA's content is Bible text, where
		// violence, war, and other mature themes are routine and legitimate, so blocking on those
		// categories would false-positive on real scripture.
		//
		// P1 (prompt injection) was enabled at BLOCK originally, but disabled 2026-08-29 after it
		// false-positived on editor's real ai-assist system instruction the first time this gateway's
		// guardrails were ever exercised against real app content (see PR #69) -- Llama Guard flagged
		// it as injection, most likely because the Phase-1-encoding worked example is itself an
		// imperative-mood sample sentence ("You(Christ) (imp) listen to me...") sitting next to
		// directive framing in the Conventions section, a combination that pattern-matches against
		// what P1 looks for even though it's legitimate domain content. We *want* prompt-injection
		// protection here -- it's off only because the false-positive rate against this app's actual
		// prompts made it unusable, not because the risk isn't real. Revisit if Cloudflare's guardrail
		// model improves, or if editor's system instruction can be reworded to dodge the false
		// positive without weakening it (higher-risk, needs re-verifying against the live gateway
		// either way -- don't just assume a rewording fixes it).
		prompt: {},
		// Prompt injection isn't a meaningful concept for a model's own response, so nothing is set
		// here -- but Cloudflare's API requires the `response` object to be present regardless.
		response: {},
	},
}
