import { create_ai_client, type AiCallDefaults, type AiCallUsage, type AiClient, type AiGatewayConfig, type GenerateJsonParams } from '@tabitha/ai'
import brief_main_prompt from '#lib/server/brief/brief_main_prompt.md?raw'
import brief_short_prompt from '#lib/server/brief/brief_short_prompt.md?raw'
import translate_prompt from '#lib/server/brief/translate_prompt.md?raw'
import type { CallKind, Variant } from './variants'

export type EvalCall = AiCallUsage & { kind: CallKind }

export type EvalAiClient = {
	ai: AiClient
	// Every successful call so far, in order, tagged with which pipeline step made it.
	calls: EvalCall[]
}

// Its own feature name keeps eval traffic apart from real use in the gateway logs and usage data.
const EVAL_FEATURE = 'copilot-eval'

export function create_eval_ai_client({ variant, gateway }: { variant: Variant, gateway: AiGatewayConfig }): EvalAiClient {
	const reported: AiCallUsage[] = []
	const calls: EvalCall[] = []
	const inner = create_ai_client({ app: 'copilot', feature: EVAL_FEATURE, gateway, on_usage: usage => reported.push(usage) })

	async function generate_json<T>(params: GenerateJsonParams): Promise<T> {
		const kind = to_call_kind(params.system_instruction)
		const reported_before = reported.length
		try {
			return await inner.generate_json<T>(apply_variant({ variant, kind, params }))
		} finally {
			calls.push(...reported.slice(reported_before).map(usage => ({ ...usage, kind })))
		}
	}

	return {
		ai: { generate_json, generate_text: inner.generate_text },
		calls,
	}
}

export function to_call_kind(system_instruction: string | undefined): CallKind {
	if (system_instruction === brief_main_prompt) return 'brief'
	if (system_instruction === translate_prompt) return 'translate'
	return 'notes'
}

// Every eval call skips the gateway cache: a cached answer would replay an earlier generation
// (possibly from real use) instead of measuring this variant.
export function apply_variant({ variant, kind, params }: { variant: Variant, kind: CallKind, params: GenerateJsonParams }): GenerateJsonParams {
	const config = params.config as AiCallDefaults & { httpOptions?: { headers?: Record<string, string> } } | undefined
	const thinking_level = variant.thinking?.[kind]

	return {
		...params,
		contents: variant.encoding_as_object && kind === 'notes' ? with_encoding_object(params.contents) : params.contents,
		system_instruction: variant.short_brief_prompt && kind === 'brief' ? brief_short_prompt : params.system_instruction,
		config: {
			...config,
			...thinking_level ? { thinkingConfig: { thinkingLevel: thinking_level } as AiCallDefaults['thinkingConfig'] } : {},
			httpOptions: { headers: { ...config?.httpOptions?.headers, 'cf-aig-skip-cache': 'true' } },
		},
	}
}

function with_encoding_object(contents: unknown): unknown {
	const input = contents as { tbta_encoding?: unknown }
	if (typeof input.tbta_encoding !== 'string') return contents
	return { ...input, tbta_encoding: JSON.parse(input.tbta_encoding) }
}
