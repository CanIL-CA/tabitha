import { REGEXES } from '#lib/regexes.js'
import { ERRORS } from './error_messages'
import { TOKEN_TYPE, create_clause_token, create_added_token, flatten_sentence, MESSAGE_TYPE, set_message_plain } from '../token'
import type { Clause, Sentence, Token } from '#lib/types.js'

export function clausify(tokens: Token[]): Sentence[] {
	if (tokens.length === 0) {
		return []
	}

	const sentences: Sentence[] = []
	const clause_tokens: Token[][] = []
	let sentence_is_ending = false

	start_sentence()
	for (const token of tokens) {
		// sentences can end like ]. or .] or ."] etc
		if (sentence_is_ending && !is_clause_end_token(token)) {
			end_sentence()
			start_sentence()
		}

		if (token.token.includes('[')) {
			start_clause()

			if (clause_tokens.length > 4) {
				set_message_plain({ token, message: {
					...MESSAGE_TYPE.WARNING,
					message: 'Clause nesting depth exceeds 3 levels. Consider reworking the sentence for clarity.',
					rule_id: 'clause:nesting_depth',
				} })
			}
		}

		add_token_to_clause(token)

		if (token.token === ']') {
			end_clause()
		}

		if (is_sentence_end_token(token)) {
			sentence_is_ending = true
		}
	}

	if (!sentence_is_ending && !is_only_notes()) {
		// add a 'missing period' error
		add_token_to_clause(create_added_token({ token: '.', message: { ...MESSAGE_TYPE.ERROR, message: ERRORS.MISSING_PERIOD, rule_id: 'clause:syntax' } }))
	}

	end_sentence()

	return sentences

	function add_token_to_clause(token: Token) {
		clause_tokens[clause_tokens.length - 1].push(token)
	}

	function start_sentence() {
		start_clause()
		sentence_is_ending = false
	}

	function end_sentence() {
		while (clause_tokens.length > 1) {
			add_token_to_clause(create_added_token({ token: ']', message: { ...MESSAGE_TYPE.ERROR, message: ERRORS.MISSING_CLOSING_BRACKET, rule_id: 'clause:syntax' } }))
			end_clause()
		}

		sentences.push({ clause: create_clause('main_clause') })
	}

	function start_clause() {
		clause_tokens.push([])
	}

	function end_clause() {
		if (clause_tokens.length === 1) {
			clause_tokens[0].splice(0, 0, create_added_token({ token: '[', message: { ...MESSAGE_TYPE.ERROR, message: ERRORS.MISSING_OPENING_BRACKET, rule_id: 'clause:syntax' } }))
			return
		}

		add_token_to_clause(create_clause('subordinate_clause'))
	}

	function create_clause(tag: string): Clause {
		return create_clause_token({ sub_tokens: clause_tokens.pop()!, tag: { clause_type: tag } })
	}

	function is_sentence_end_token(token: Token): boolean {
		return token.type === TOKEN_TYPE.PUNCTUATION && REGEXES.SENTENCE_ENDING_PUNCTUATION.test(token.token)
	}

	function is_clause_end_token(token: Token): boolean {
		return token.type === TOKEN_TYPE.PUNCTUATION && REGEXES.CLAUSE_ENDING_PUNCTUATION.test(token.token)
	}

	function is_only_notes(): boolean {
		return clause_tokens.length <= 1 && clause_tokens[0].every(({ type }) => type === TOKEN_TYPE.NOTE)
	}
}

export function flatten_sentences(sentences: Sentence[]): Token[] {
	return sentences.flatMap(flatten_sentence)
}
