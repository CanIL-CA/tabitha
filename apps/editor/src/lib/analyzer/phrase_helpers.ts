import { TOKEN_TYPE } from '#lib/token.js'
import type { Token } from '#lib/types.js'

/**
 * Helpers for traversing phrasified tokens, where each phrase is a flat run of tokens
 * starting with an opening token (eg. '{NP') and ending with a closing '}'.
 */

/**
 * A run of flat tokens that move together: either a single token (eg. a clause, conjunction or particle),
 * or a phrase from its opening token (eg. '{NP') through its closing '}'.
 */
export type ConstituentSpan = Token[]

export function is_phrase_start(token: Token): boolean {
	return token.type === TOKEN_TYPE.PHRASE && token.token.startsWith('{')
}

export function is_phrase_end(token: Token): boolean {
	return token.type === TOKEN_TYPE.PHRASE && token.token === '}'
}

export function is_np_start(token: Token): boolean {
	return token.type === TOKEN_TYPE.PHRASE && token.token === '{NP'
}

export function get_depth_change(token: Token): number {
	if (is_phrase_start(token)) return 1
	if (is_phrase_end(token)) return -1
	return 0
}

/**
 * The tokens from the one at start_index through its matching '}', or just that token when it doesn't open a phrase.
 */
export function get_phrase_span({ tokens, start_index }: { tokens: Token[]; start_index: number }): ConstituentSpan {
	let depth = 0
	for (let i = start_index; i < tokens.length; i++) {
		depth += get_depth_change(tokens[i])
		if (depth <= 0) {
			return tokens.slice(start_index, i + 1)
		}
	}
	return tokens.slice(start_index)
}

/**
 * The index of the '{NP' that contains the token at the given index, skipping any other kind of phrase in between. -1 if there is none.
 */
export function find_enclosing_np_start({ tokens, index }: { tokens: Token[]; index: number }): number {
	let depth = 0
	for (let i = index - 1; i >= 0; i--) {
		if (is_phrase_end(tokens[i])) {
			depth += 1
		} else if (is_phrase_start(tokens[i]) && depth > 0) {
			depth -= 1
		} else if (is_np_start(tokens[i])) {
			return i
		}
	}
	return -1
}

/**
 * The NP's own noun, skipping nouns inside nested phrases (saxon genitives, made_of, title, etc.)
 */
export function get_np_head({ tokens, np_start_index }: { tokens: Token[]; np_start_index: number }): Token | null {
	let depth = 0
	for (let i = np_start_index; i < tokens.length; i++) {
		depth += get_depth_change(tokens[i])
		if (depth === 0) {
			return null
		}
		if (depth === 1 && tokens[i].lookup_results[0]?.part_of_speech === 'Noun') {
			return tokens[i]
		}
	}
	return null
}
