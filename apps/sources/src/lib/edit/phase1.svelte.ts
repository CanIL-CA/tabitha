import { fetch_analyzed_text } from '#lib/data/api_lookups.js'
import type { CheckerMessage, CheckerMessageLabel, CheckerToken } from '@tabitha/types'
import type { AnalyzedTextResult } from '#lib/types.ts'

type AnalyzerTokenMessage = {
	message: CheckerMessage
	token_index: number
}

const flatten_tokens = (token: CheckerToken): CheckerToken[] =>
	token.sub_tokens.length ? token.sub_tokens.flatMap(flatten_tokens) : [token]

const collect_messages = ({ tokens, labels }: { tokens: CheckerToken[], labels: CheckerMessageLabel[] }): AnalyzerTokenMessage[] =>
	tokens.flatMap((token, token_index) => {
		const messages = [...token.messages, ...token.pairing?.messages ?? [], ...token.pronoun?.messages ?? []]
		return messages.map<AnalyzerTokenMessage>(message => ({ message, token_index }))
	}).filter(({ message }) => labels.includes(message.label))

export class Phase1 {
	#text = $state('')

	analyzing = $state(false)
	analyze_result = $state.raw<AnalyzedTextResult | null>(null)

	token_messages = $state.raw<AnalyzerTokenMessage[]>([])
	api_error = $state<string | null>(null)
	error_dismissed = $state(false)

	constructor(initial_text: string) {
		this.#text = initial_text
	}

	get text() {
		return this.#text
	}

	set text(value: string) {
		this.#text = value
		this.api_error = null
	}

	dismiss_error() {
		this.error_dismissed = true
		this.api_error = null
	}

	dismiss_message(dismissed_message: AnalyzerTokenMessage) {
		this.token_messages = this.token_messages.filter(token_message => token_message !== dismissed_message)
	}

	/** Analyzes the current text. Returns `undefined` if the request failed, with the reason in `api_error`. */
	async analyze(): Promise<AnalyzedTextResult> {
		this.clear_analyze_result()
		this.analyzing = true

		try {
			const result = await fetch_analyzed_text({ text: this.text })
			const was_error = result.status === 'error'

			const tokens = result.tokens.flatMap(flatten_tokens)

			const labels_to_show: CheckerMessageLabel[] = was_error ? ['error'] : ['warning', 'suggest']
			this.token_messages = collect_messages({ tokens, labels: labels_to_show })
			this.analyze_result = { ...result, tokens }
		} catch (err) {
			this.analyze_result = { status: 'error', tokens: [], source_entities: [], ontology_results: [] }
			this.api_error = err instanceof Error ? err.message : 'Failed to analyze text'
		} finally {
			this.analyzing = false
		}

		return this.analyze_result
	}

	clear_analyze_result() {
		this.api_error = null
		this.token_messages = []
		this.analyze_result = null
		this.error_dismissed = false
	}
}
