// Cloudflare's shared AI Gateway prompt-injection guardrail (P1) is off gateway-wide -- it
// false-positived on apps/editor's own system instruction (see tools/gateway/config.ts and ADR
// 0007), so it couldn't be relied on. This is the resulting local, best-effort substitute: a
// denylist, not a guarantee, meant to catch naive/common injection framings without risking false
// positives on the real prose/data each call site sends. Message copy and length caps are owned
// by each call site since they know their own input shape and what (if anything) surfaces to a
// user; only the detection logic and pattern list are shared.

const SUSPICIOUS_PATTERNS: readonly RegExp[] = [
	/ignore\s+(all\s+|the\s+)?(previous|prior|above)\s+instructions?/i,
	/disregard\s+(all\s+|the\s+)?(previous|prior|above)\s+instructions?/i,
	/new\s+instructions?\s*:/i,
	/system\s+prompt/i,
	/you\s+are\s+now\s+an?\s/i,
	/^\s*(system|assistant|user)\s*:/im,
	/```/,
	/\[INST\]/i,
	/<\|(im_start|im_end|system)\|>/i,
]

export type CheckInputSafetyOptions = {
	readonly text: string
	readonly max_length: number
	readonly too_long_message: string
	readonly suspicious_message: string
	readonly log_label: string
}

/** Returns a rejection message if `text` looks unsafe to send to the model, or `undefined` if
 * it's fine. Callers decide what to do with the message -- show it to a user, log it and fail
 * soft, or both. */
export function check_input_safety({ text, max_length, too_long_message, suspicious_message, log_label }: CheckInputSafetyOptions): string | undefined {
	if (text.length > max_length) {
		return too_long_message
	}

	if (SUSPICIOUS_PATTERNS.some(pattern => pattern.test(text))) {
		console.warn(`${log_label}: rejected input matching a suspicious pattern (${text.length} chars)`)
		return suspicious_message
	}

	return undefined
}
