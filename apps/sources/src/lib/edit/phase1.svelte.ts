import { createContext } from 'svelte'
import { PUBLIC_EDITOR_API_HOST } from '$app/env/public'
import { create_editor_client } from '@tabitha/api-client'
import { fetch_analyzed_text } from '#lib/data/api_lookups.js'
import type { CheckerMessage, CheckerToken, EditorCheckResult } from '@tabitha/types'
import type { AnalyzedTextResult } from '#lib/types.ts'

const editor_client = create_editor_client({ base_url: PUBLIC_EDITOR_API_HOST })

type MessageWithTokenIndex = [CheckerMessage, number]

const flatten_tokens = (token: CheckerToken): CheckerToken[] =>
	token.sub_tokens.length ? token.sub_tokens.flatMap(flatten_tokens) : [token]

const collect_errors_and_warnings = (tokens: CheckerToken[]): MessageWithTokenIndex[] =>
	tokens
		.flatMap((token, token_index) => {
			const messages = [...token.messages, ...token.pairing?.messages ?? [], ...token.pronoun?.messages ?? []]
			return messages.map<MessageWithTokenIndex>(message => [message, token_index])
		})
		.filter(([message]) => ['error', 'warning'].includes(message.label))

export class Phase1 {
	is_checked: boolean
	check_result = $state.raw<EditorCheckResult | null>(null)
	errors_and_warnings = $state.raw<MessageWithTokenIndex[]>([])
	checking = $state(false)
	analyzing = $state(false)
	api_error = $state<string | null>(null)
	#text = $state('')
	#checked_text = $state<string | null>(null)

	constructor(initial_text: string) {
		this.#text = initial_text
		this.is_checked = $derived(this.#checked_text === this.#text)
	}

	get text() {
		return this.#text
	}

	set text(value: string) {
		this.#text = value
		this.api_error = null
	}

	async check() {
		this.api_error = null
		this.check_result = null
		this.checking = true

		const text_to_check = this.text
		try {
			const check_response = await editor_client.check_text({ text: text_to_check })
			if (!check_response) throw new Error('Checker API request failed')

			const tokens = check_response.tokens.flatMap(flatten_tokens)
			this.errors_and_warnings = collect_errors_and_warnings(tokens)
			this.check_result = { ...check_response, tokens }
			this.#checked_text = text_to_check
		} catch (err) {
			this.api_error = err instanceof Error ? err.message : 'Failed to check text'
		} finally {
			this.checking = false
		}
	}

	/** Analyzes the current text. Returns `undefined` if the request failed, with the reason in `api_error`. */
	async analyze(): Promise<AnalyzedTextResult | undefined> {
		this.api_error = null
		this.check_result = null
		this.analyzing = true

		try {
			return await fetch_analyzed_text({ text: this.text })
		} catch (err) {
			this.api_error = err instanceof Error ? err.message : 'Failed to analyze text'
			return undefined
		} finally {
			this.analyzing = false
		}
	}
}

export const [get_phase1, set_phase1] = createContext<() => Phase1>()
