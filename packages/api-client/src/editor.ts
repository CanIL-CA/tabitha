import type { EditorCheckResult, EditorAnalyzeResult, AiAssistResult } from '@tabitha/types'
import { create_http_client, type ClientOptions } from './http'
import { sanitize_input_whitespace } from './text'

export type EditorClient = ReturnType<typeof create_editor_client>
export type EditorClientOptions = ClientOptions

/**
 * Creates a typed HTTP client for communicating with the Editor service (`apps/editor`).
 *
 * @example
 * ```typescript
 * import { create_editor_client } from '@tabitha/api-client'
 *
 * const editor = create_editor_client({
 *   base_url: PUBLIC_EDITOR_API_HOST,
 * })
 *
 * const check = await editor.check_text({ text: 'Paul wrote a letter.' })
 * ```
 */
export function create_editor_client(options: EditorClientOptions) {
	const http = create_http_client(options)

	return {
		/**
		 * Check, analyze, and generate backtranslation tokens for a given source text.
		 */
		async check_text({ text, auto_fix }: { text: string, auto_fix?: boolean }): Promise<EditorCheckResult | null> {
			const params = new URLSearchParams({ text: sanitize_input_whitespace(text) })
			if (auto_fix) params.append('auto_fix', 'on')
			return http.get<EditorCheckResult>(`/check?${params}`)
		},

		/**
		 * Parse input text into sentences and extract source entities and features.
		 */
		async analyze_text(text: string): Promise<EditorAnalyzeResult | null> {
			return http.get<EditorAnalyzeResult>(`/analyze?text=${encodeURIComponent(sanitize_input_whitespace(text))}`)
		},

		/**
		 * Convert English text into the more strict phase 1 syntax
		 */
		async ai_assist_generate(text: string): Promise<AiAssistResult | null> {
			return http.post<AiAssistResult>('/ai-assist/generate', { text: sanitize_input_whitespace(text) })
		},
	}
}
