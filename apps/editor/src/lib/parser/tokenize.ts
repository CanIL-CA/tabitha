import { CLAUSE_NOTATIONS, suggest_clause_notations } from './clause_notations'
import { FUNCTION_WORDS } from './function_words'
import { REGEXES } from '#lib/regexes.js'
import { MESSAGE_TYPE, TOKEN_TYPE, create_token } from '../token'
import { ERRORS } from './error_messages'
import type { PairingType, CheckerTokenType } from '@tabitha/types'
import type { Token } from '#lib/types.js'

function normalize_input(text: string): string {
	return text
		// U+201C : LEFT DOUBLE QUOTATION MARK
		// U+201D : RIGHT DOUBLE QUOTATION MARK
		.replaceAll(/[“”]/g, '"')
		// U+2019 : RIGHT SINGLE QUOTATION MARK
		// U+02BC : MODIFIER LETTER APOSTROPHE
		.replaceAll(/[’ʼ]/g, "'")
}

export function tokenize_input(text: string = ''): Token[] {
	text = normalize_input(text)

	const parsers: Array<[() => boolean, () => Token]> = [
		[() => match_word_start(), word],
		[() => match(REGEXES.OPENING_PAREN), clause_notation],
		[() => match(/_/), underscore_notation],
		[() => match(/:/), colon],
		[() => match(/[["]/), opening_punctuation],
		[() => match(/[.,?!\]]/), closing_punctuation],
	]

	const tokens: Token[] = []
	let token_start = 0

	let i = 0
	while (!is_at_end()) {
		token_start = i
		if (match(REGEXES.ANY_WHITESPACE)) {
			continue
		}
		const parser = parsers.find(([check]) => check())?.[1] ?? invalid_opening_char
		tokens.push({ ...parser(), source_range: { start: token_start, end: i } })
	}

	return tokens

	function match_word_start() {
		return match(REGEXES.WORD_START_CHAR) || match_two(REGEXES.DECIMAL_START_CHARS)
	}

	// single term, pairing, or pronoun
	function word(): Token {
		const term_token = term_or_pairing(token_start)

		if (term_token.pairing === null && peek_match(REGEXES.OPENING_PAREN)) {
			// can't have a pronoun referent within a pairing
			const referent_token = pronoun_referent()
			return check_boundary_for_token(() => referent_token)
		} else {
			return check_boundary_for_token(() => term_token)
		}
	}

	// advances until the end of a single lookup term, but doesn't create a token
	function term(start: number): string {
		eat(REGEXES.WORD_CHAR)
		if (match_two(/\.\d/)) {
			// may be a decimal number like 2.5
			eat(/\d/)
		}
		return collect_text(start)
	}

	function term_or_pairing(start: number): Token {
		const term_token = word_token(term(start))

		if (match(REGEXES.FORWARD_SLASH)) {
			return pairing({ left_token: term_token, pairing_type: 'simple-complex' })
		} else if (match(REGEXES.PIPE)) {
			return pairing({ left_token: term_token, pairing_type: 'dynamic-literal' })
		} else {
			return term_token
		}
	}

	function pairing({ left_token, pairing_type }: {
		left_token: Token
		pairing_type: PairingType
	}): Token {
		const right_start = i
		if (!match_word_start()) {
			// simple/ or dynamic|
			eat_until(REGEXES.TOKEN_END_BOUNDARY)
			return error_token(pairing_type === 'simple-complex' ? ERRORS.INVALID_COMPLEX_PAIRING_SYNTAX : ERRORS.INVALID_LITERAL_PAIRING_SYNTAX)
		}
		const right_token = word_token(term(right_start))
		left_token.pairing = right_token
		left_token.pairing_type = pairing_type
		return left_token
	}

	// can be either a single term or pairing
	function pronoun_referent(): Token {
		const pronoun_token = simple_token(TOKEN_TYPE.FUNCTION_WORD)
		advance()	// skip the opening paren

		const referent_start = i
		if (!match(REGEXES.WORD_START_CHAR)) {
			// pronoun(?) pronoun(_)
			eat_until(REGEXES.TOKEN_END_BOUNDARY)
			return error_token(ERRORS.INVALID_PRONOUN_REFERENT_SYNTAX)
		}

		const referent_token = term_or_pairing(referent_start)
		if (referent_token.messages.length > 0) {
			// there was an issue with the pairing syntax
			return referent_token
		}

		if (!match(REGEXES.CLOSING_PAREN)) {
			// pronoun(X 
			return error_token(ERRORS.MISSING_CLOSING_PAREN)
		}

		referent_token.pronoun = pronoun_token
		return referent_token
	}

	function colon(): Token {
		if (peek_match(/\d/)) {
			// verse reference
			return create_token({
				token: collect_text(),
				type: TOKEN_TYPE.LOOKUP_WORD,
				lookup_terms: ['-ReferenceMarker'],
				tag: { 'syntax': 'verse_ref_colon' },
			})
		}
		return check_boundary_for_token(() => simple_token(TOKEN_TYPE.PUNCTUATION))
	}

	function clause_notation(): Token {
		// any non-boundary character can go between the parentheses
		eat_until(REGEXES.OR({ regex1: REGEXES.TOKEN_END_BOUNDARY, regex2: REGEXES.CLOSING_PAREN }))
		if (!match(REGEXES.CLOSING_PAREN)) {
			// (imp
			return error_token(ERRORS.MISSING_CLOSING_PAREN)

		} else if (!CLAUSE_NOTATIONS.includes(collect_text())) {
			// (invalid-notation)
			return error_token(ERRORS.UNRECOGNIZED_CLAUSE_NOTATION(suggest_clause_notations(collect_text())))
		}

		return check_boundary_for_token(() => simple_token(TOKEN_TYPE.NOTE))
	}

	function underscore_notation(): Token {
		// anything can go after the underscore
		// in addition to the normal boundary punctuation, [ can follow as well
		eat_until(REGEXES.OR({ regex1: REGEXES.TOKEN_END_BOUNDARY, regex2: REGEXES.OPENING_BRACKET }))
		return simple_token(TOKEN_TYPE.NOTE)
	}

	function closing_punctuation(): Token {
		// Cannot be followed directly by text or [
		return check_boundary_for_token(() => simple_token(TOKEN_TYPE.PUNCTUATION))
	}

	function opening_punctuation(): Token {
		// Can be followed by anything
		return simple_token(TOKEN_TYPE.PUNCTUATION)
	}

	function check_boundary_for_token(token_if_valid: (text: string) => Token): Token {
		if (!is_at_end() && !peek_match(REGEXES.TOKEN_END_BOUNDARY)) {
			return invalid_closing_char()
		}

		return token_if_valid(collect_text())
	}

	function invalid_opening_char(): Token {
		const char = peek()
		eat_until(REGEXES.TOKEN_END_BOUNDARY)

		const messages = new Map<string, string>([
			[')', ERRORS.MISSING_OPENING_PAREN],
			['/', ERRORS.INVALID_COMPLEX_PAIRING_SYNTAX],
			['|', ERRORS.INVALID_LITERAL_PAIRING_SYNTAX],
			['\\', ERRORS.INVALID_LITERAL_PAIRING_SYNTAX],
		])

		return error_token(messages.get(char) || ERRORS.UNRECOGNIZED_CHAR)
	}

	function invalid_closing_char(): Token {
		if (match(REGEXES.OPENING_BRACKET)) {
			// token[ .[ ][ etc
			return error_token(ERRORS.NO_SPACE_BEFORE_OPENING_BRACKET)

		} else if (match(REGEXES.CLOSING_PAREN)) {
			// token) .)
			eat_until(REGEXES.TOKEN_END_BOUNDARY)
			return error_token(ERRORS.MISSING_OPENING_PAREN)

		} else if (match_two(/_\w/)) {
			// token_note ._note
			eat_until(REGEXES.TOKEN_END_BOUNDARY)
			return error_token(ERRORS.NO_SPACE_BEFORE_UNDERSCORE)

		} else {
			// .token token_ ?token
			const text = collect_text()
			eat_until(REGEXES.TOKEN_END_BOUNDARY)
			return error_token(ERRORS.INVALID_TOKEN_END(text))
		}
	}

	function collect_text(start: number | null = null): string {
		return text.substring(start ?? token_start, i)
	}

	function word_token(token: string): Token {
		return get_function_word(token) || lookup_token(token)
	}

	function get_function_word(token: string): Token | null {
		const word_function = FUNCTION_WORDS.get(token.toLowerCase())
		return word_function ? create_token({ token, type: TOKEN_TYPE.FUNCTION_WORD, tag: word_function }) : null
	}

	function lookup_token(text: string): Token {
		const lookup_match = text.match(REGEXES.EXTRACT_LOOKUP_TERM)!

		// combine stem and sense
		const stem = lookup_match[1]
		const sense = lookup_match[2] ?? ''
		return create_token({ token: text, type: TOKEN_TYPE.LOOKUP_WORD, lookup_terms: [stem], specified_sense: sense })
	}

	function error_token(message: string): Token {
		return create_token({ token: collect_text(), type: TOKEN_TYPE.NOTE, messages: [{ ...MESSAGE_TYPE.ERROR, message, rule_id: 'token:syntax' }] })
	}

	function simple_token(type: CheckerTokenType): Token {
		return create_token({ token: collect_text(), type })
	}

	function peek(): string {
		return text[i]
	}

	// peek_match() checks if the current character matches the given regex without advancing
	function peek_match(regex: RegExp): boolean {
		return !is_at_end() && Boolean(peek().match(regex))
	}

	// match() advances if the current character matches the given regex
	function match(regex: RegExp): boolean {
		if (peek_match(regex)) {
			advance()
			return true
		}
		return false
	}

	// match_two() advances if the next two characters match the given regex
	function match_two(regex: RegExp): boolean {
		if (i < text.length - 1 && (text[i] + text[i + 1]).match(regex)) {
			i += 2
			return true
		}

		return false
	}

	// eat() advances greedily until a character does not match the given regex
	function eat(regex: RegExp) {
		while (peek_match(regex)) {
			advance()
		}
	}

	// eat_until() advances greedily until a character matches the given regex
	function eat_until(regex: RegExp) {
		while (!is_at_end() && !peek().match(regex)) {
			advance()
		}
	}

	function advance() {
		i++
	}

	function is_at_end(): boolean {
		return i >= text.length
	}
}
