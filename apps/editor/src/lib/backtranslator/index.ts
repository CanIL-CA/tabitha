import { TOKEN_TYPE } from '#lib/token.js'
import { rules_applier } from '#lib/rules/index.js'
import { phrasify } from '#lib/parser/phrasify.js'
import { BT_STRUCTURAL_RULES } from './structural_rules'
import type { Sentence, Token } from '#lib/types.js'

export function backtranslate(sentences: Sentence[]): string {
	const cleaned = remove_some_gap_tokens(sentences)
	const phrasified = phrasify(cleaned)
	const structured = rules_applier(BT_STRUCTURAL_RULES)(phrasified)
	const text = textify(structured)
	return find_replace(text)
}

export function remove_some_gap_tokens(sentences: Sentence[]): Sentence[] {
	return remove_intv_v_gaps(sentences.map(sentence => sentence.clause)).map(clause => ({ clause }))

	function remove_intv_v_gaps(tokens: Token[]): Token[] {
		return tokens.filter(token => token.token !== 'GAP_INTV_V').map(token => {
			token.sub_tokens = remove_intv_v_gaps(token.sub_tokens)
			return token
		})
	}
}

export function textify(sentences: Sentence[]): string {
	return textify_tokens(sentences.map(sentence => sentence.clause))

	function textify_tokens(tokens: Token[]): string {
		return tokens.map(textify_token).filter(text => text).join(' ')
	}

	function textify_token(token: Token): string {
		if (token.sub_tokens.length) {
			return textify_tokens(token.sub_tokens)
		} else if (token.pronoun) {
			return textify_token(token.pronoun)
		} else if (token.pairing && token.pairing_type === 'simple-complex') {
			// Only show the complex word
			return textify_lookup_word(token.pairing)
			// No special handling for literal pairings; handled elsewhere
		} else if (token.type === TOKEN_TYPE.ADDED) {
			return ''
		} else if (token.type === TOKEN_TYPE.PHRASE) {
			return ''
		} else if (token.type === TOKEN_TYPE.GAP) {
			return ''
		} else if (token.token.startsWith('_')) {
			return ''
		} else if (['[', ']'].includes(token.token)) {
			return ''
		} else if (token.type === TOKEN_TYPE.LOOKUP_WORD) {
			return textify_lookup_word(token)
		} else {
			// Any remaining function words, punctuation, and notes
			return token.token
		}
	}

	function textify_lookup_word(token: Token): string {
		// Remove the sense from the token and any remaining hyphens
		// We want to keep the hyphen in notes like (poetry-begin) so this is specific to lookup words
		return token.token.replace(/-[A-Z]$/, '').replace(/(\w)-(\w)/g, '$1 $2')
	}
}

export function find_replace(text: string): string {
	return text
		// remove both spaces around hyphen (found in verse references)
		.replace(/ - /g, '-')
		// always remove spaces before certain punctuation
		.replace(/ ([.,:?!>)}])/g, '$1')
		// always remove spaces after some punctuation
		.replace(/([<({]) /g, '$1')
		// remove spaces after a verse-reference colon
		.replace(/(\d:) (\d)/g, '$1$2')
		// remove comma before other punctuation
		.replace(/,([,.:?!])/g, '$1')
		// remove spaces after opening quotes
		.replace(/, " /g, ', "')
		// remove spaces before closing quotes
		.replace(/([.?!]) "/g, '$1"')
		// remove neighboring implicit markers
		.replace(/>> <</g, ' ')
		.replace(/([^>])> <([^<])/g, '$1 $2')
		// move comma into the implicitNecessary marking
		.replace(/([^>])>,/g, '$1,>')
}