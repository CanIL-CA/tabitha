import type { Theme } from '@tabitha/ui/themes'

// Every app writes to the one tabitha_usage dataset, so this file is its schema.
// Analytics Engine columns are positional: append new fields, never reorder existing ones.
// The column layout and example queries live in docs/decisions/0017-usage-analytics-engine.md.

export type UsageApp = 'copilot' | 'editor' | 'ontology' | 'sources' | 'targets'

export type SearchEvent = {
	readonly kind: 'search'
	readonly scope: string
	readonly filter: string
	readonly q: string
	// null when the search hands off instead of listing results (a redirect to another page)
	readonly result_count: number | null
	readonly note?: string
	readonly referred_by?: string
}

export type ThemeEvent = {
	readonly kind: 'theme'
	readonly theme: Theme
}

export type CopilotRunEvent = {
	readonly kind: 'copilot_run'
	readonly caller: string
	readonly run: 'verse' | 'batch'
	readonly book: string
	readonly mode: string
	readonly lwc: string
	readonly mtt_level: string
	readonly sensitivity: number
	readonly customized_profile: readonly string[]
	readonly verse_count: number
	readonly error_count: number
	readonly error?: string
}

export type CheckEvent = {
	readonly kind: 'check'
	readonly caller: string
	readonly status: string
	readonly error_count: number
	readonly warning_count: number
	readonly token_count: number
}

export type AiAssistEvent = {
	readonly kind: 'ai_assist'
	readonly status: string
	readonly check_status: string
	readonly note_count: number
	readonly message?: string
}

export type AiCallEvent = {
	readonly kind: 'ai_call'
	readonly feature: string
	readonly cache_status: string
	readonly thinking_level: string
	readonly prompt_tokens: number
	readonly output_tokens: number
	readonly thought_tokens: number
	readonly cached_tokens: number
	readonly duration_ms: number
}

export type UsageEvent = SearchEvent | ThemeEvent | CopilotRunEvent | CheckEvent | AiAssistEvent | AiCallEvent

// A structural subset of Cloudflare's AnalyticsEngineDataset, so neither this package nor an
// app without generated Worker types needs @cloudflare/workers-types to use it.
export type UsageDataPoint = {
	readonly indexes: string[]
	readonly blobs: string[]
	readonly doubles: number[]
}

export type UsageDataset = {
	writeDataPoint(point: UsageDataPoint): void
}

const MAX_TEXT_LENGTH = 100

const clip = (text = ''): string => text.trim().slice(0, MAX_TEXT_LENGTH)

const normalize_query = (q: string): string => clip(q.toLowerCase())

function to_fields(event: UsageEvent): { blobs: string[], doubles: number[] } {
	switch (event.kind) {
		case 'search':
			return {
				blobs: [event.scope, event.filter, normalize_query(event.q), event.note ?? '', event.referred_by ?? ''],
				doubles: event.result_count === null ? [] : [event.result_count],
			}
		case 'theme':
			return { blobs: [event.theme], doubles: [] }
		case 'copilot_run':
			return {
				blobs: [
					event.caller,
					event.run,
					event.book,
					event.mode,
					event.lwc,
					event.mtt_level,
					event.customized_profile.join(','),
					clip(event.error),
				],
				doubles: [event.verse_count, event.error_count, event.sensitivity],
			}
		case 'check':
			return {
				blobs: [event.caller, event.status],
				doubles: [event.error_count, event.warning_count, event.token_count],
			}
		case 'ai_assist':
			return {
				blobs: [event.status, event.check_status, clip(event.message)],
				doubles: [event.note_count],
			}
		case 'ai_call':
			return {
				blobs: [event.feature, event.cache_status, event.thinking_level],
				doubles: [event.prompt_tokens, event.output_tokens, event.thought_tokens, event.cached_tokens, event.duration_ms],
			}
	}
}

export function to_data_point({ app, event }: { app: UsageApp, event: UsageEvent }): UsageDataPoint {
	const { blobs, doubles } = to_fields(event)

	return {
		indexes: [event.kind],
		blobs: [app, event.kind, ...blobs],
		doubles,
	}
}
