import { describe, expect, test } from 'vitest'
import { CLAUSE_NOTATIONS } from './clause_notations'
import { ERRORS } from './error_messages'
import { FUNCTION_WORDS } from './function_words'
import { MESSAGE_TYPE, TOKEN_TYPE, create_token } from '../token'
import { tokenize_input as tokenize_with_ranges } from './tokenize'
import type { PairingType } from '@tabitha/types'
import type { Token } from '#lib/types.js'

// Source ranges have their own test below; toEqual treats an undefined property as absent
function tokenize_input(text: string): Token[] {
	return tokenize_with_ranges(text).map(token => ({ ...token, source_range: undefined }))
}

function create_word_token({ token, lookup_term, sense = '' }: {
	token: string
	lookup_term?: string
	sense?: string
}): Token {
	return create_token({ token, type: TOKEN_TYPE.LOOKUP_WORD, lookup_terms: [lookup_term || token], specified_sense: sense })
}

function create_pairing({ left_token, right_token, pairing_type }: {
	left_token: Token
	right_token: Token
	pairing_type: PairingType
}): Token {
	left_token.pairing = right_token
	left_token.pairing_type = pairing_type
	return left_token
}

function create_pronoun_token({ pronoun, referent_token }: {
	pronoun: string
	referent_token: Token
}): Token {
	const pronoun_token = create_token({ token: pronoun, type: TOKEN_TYPE.FUNCTION_WORD })
	referent_token.pronoun = pronoun_token
	return referent_token
}

function create_error_token({ token, message }: {
	token: string
	message: string
}): Token {
	return create_token({ token, type: TOKEN_TYPE.NOTE, messages: [{ ...MESSAGE_TYPE.ERROR, message, rule_id: 'token:syntax' }] })
}

describe('tokenize_input', () => {
	test("'' should return an empty array", () => {
		const INPUT = ''

		const EXPECTED_OUTPUT: Token[] = []

		expect(tokenize_input(INPUT)).toEqual(EXPECTED_OUTPUT)
	})

	test('any whitespace should split tokens', () => {
		const INPUT = `z b    c
		d	e		  f

		g`

		const EXPECTED_OUTPUT = [
			create_word_token({ token: 'z' }),
			create_word_token({ token: 'b' }),
			create_word_token({ token: 'c' }),
			create_word_token({ token: 'd' }),
			create_word_token({ token: 'e' }),
			create_word_token({ token: 'f' }),
			create_word_token({ token: 'g' }),
		]

		expect(tokenize_input(INPUT)).toEqual(EXPECTED_OUTPUT)
	})

	test('valid words', () => {
		const INPUT = "token tokens token's token-A token's-A in-order-to Holy-Spirit's token123 123"

		const EXPECTED_OUTPUT = [
			create_word_token({ token: 'token', lookup_term: 'token' }),
			create_word_token({ token: 'tokens', lookup_term: 'tokens' }),
			create_word_token({ token: "token's", lookup_term: 'token' }),
			create_word_token({ token: 'token-A', lookup_term: 'token', sense: 'A' }),
			create_word_token({ token: "token's-A", lookup_term: 'token', sense: 'A' }),
			create_word_token({ token: 'in-order-to', lookup_term: 'in-order-to' }),
			create_word_token({ token: "Holy-Spirit's", lookup_term: 'Holy-Spirit' }),
			create_word_token({ token: 'token123', lookup_term: 'token123' }),
			create_word_token({ token: '123', lookup_term: '123' }),
		]

		expect(tokenize_input(INPUT)).toEqual(EXPECTED_OUTPUT)
	})

	test('valid words with decimal', () => {
		const INPUT = '2.5 .5 .1. 3.88] 2.5'

		const EXPECTED_OUTPUT = [
			create_word_token({ token: '2.5', lookup_term: '2.5' }),
			create_word_token({ token: '.5', lookup_term: '.5' }),
			create_word_token({ token: '.1', lookup_term: '.1' }),
			create_token({ token: '.', type: TOKEN_TYPE.PUNCTUATION }),
			create_word_token({ token: '3.88', lookup_term: '3.88' }),
			create_token({ token: ']', type: TOKEN_TYPE.PUNCTUATION }),
			create_word_token({ token: '2.5', lookup_term: '2.5' }),
		]

		expect(tokenize_input(INPUT)).toEqual(EXPECTED_OUTPUT)
	})

	test('invalid words', () => {
		const INPUT = '.token ,token token['

		const EXPECTED_OUTPUT = [
			create_error_token({ token: '.token', message: ERRORS.INVALID_TOKEN_END('.') }),
			create_error_token({ token: ',token', message: ERRORS.INVALID_TOKEN_END(',') }),
			create_error_token({ token: 'token[', message: ERRORS.NO_SPACE_BEFORE_OPENING_BRACKET }),
		]

		expect(tokenize_input(INPUT)).toEqual(EXPECTED_OUTPUT)
	})

	test('valid pronoun referents', () => {
		const INPUT = "you(Paul) abc(test) your(Paul's) your(son-C) your(son's-C) your(sons'-C)] you(Paul) you(follower/disciple) you(follower|disciple)."

		const EXPECTED_OUTPUT = [
			create_pronoun_token({ pronoun: 'you', referent_token: create_word_token({ token: 'Paul' }) }),
			create_pronoun_token({ pronoun: 'abc', referent_token: create_word_token({ token: 'test' }) }),
			create_pronoun_token({ pronoun: 'your', referent_token: create_word_token({ token: 'Paul\'s', lookup_term: 'Paul' }) }),
			create_pronoun_token({ pronoun: 'your', referent_token: create_word_token({ token: 'son-C', lookup_term: 'son', sense: 'C' }) }),
			create_pronoun_token({ pronoun: 'your', referent_token: create_word_token({ token: 'son\'s-C', lookup_term: 'son', sense: 'C' }) }),
			create_pronoun_token({ pronoun: 'your', referent_token: create_word_token({ token: 'sons\'-C', lookup_term: 'sons', sense: 'C' }) }),
			create_token({ token: ']', type: TOKEN_TYPE.PUNCTUATION }),
			create_pronoun_token({ pronoun: 'you', referent_token: create_word_token({ token: 'Paul' }) }),
			create_pronoun_token({ pronoun: 'you', referent_token: create_pairing({ left_token: create_word_token({ token: 'follower' }), right_token: create_word_token({ token: 'disciple' }), pairing_type: 'simple-complex' }) }),
			create_pronoun_token({ pronoun: 'you', referent_token: create_pairing({ left_token: create_word_token({ token: 'follower' }), right_token: create_word_token({ token: 'disciple' }), pairing_type: 'dynamic-literal' }) }),
			create_token({ token: '.', type: TOKEN_TYPE.PUNCTUATION }),
		]

		expect(tokenize_input(INPUT)).toEqual(EXPECTED_OUTPUT)
	})

	test('invalid pronoun referents', () => {
		const INPUT = 'you(Paul youPaul) you(Paul)[ you(Paul)_.'

		const EXPECTED_OUTPUT = [
			create_error_token({ token: 'you(Paul', message: ERRORS.MISSING_CLOSING_PAREN }),
			create_error_token({ token: 'youPaul)', message: ERRORS.MISSING_OPENING_PAREN }),
			create_error_token({ token: 'you(Paul)[', message: ERRORS.NO_SPACE_BEFORE_OPENING_BRACKET }),
			create_error_token({ token: 'you(Paul)_', message: ERRORS.INVALID_TOKEN_END('you(Paul)') }),
			create_token({ token: '.', type: TOKEN_TYPE.PUNCTUATION }),
		]

		expect(tokenize_input(INPUT)).toEqual(EXPECTED_OUTPUT)
	})

	test('valid underscore notation', () => {
		const INPUT = '_note _note. _note] [_note _note[ __implicit'

		const EXPECTED_OUTPUT = [
			create_token({ token: '_note', type: TOKEN_TYPE.NOTE }),
			create_token({ token: '_note', type: TOKEN_TYPE.NOTE }),
			create_token({ token: '.', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '_note', type: TOKEN_TYPE.NOTE }),
			create_token({ token: ']', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '[', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '_note', type: TOKEN_TYPE.NOTE }),
			create_token({ token: '_note', type: TOKEN_TYPE.NOTE }),
			create_token({ token: '[', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '__implicit', type: TOKEN_TYPE.NOTE }), 	// double underscore is fine
		]

		expect(tokenize_input(INPUT)).toEqual(EXPECTED_OUTPUT)
	})

	test('invalid underscore notation', () => {
		const INPUT = 'token_note token_ ._note ]_note'

		const EXPECTED_OUTPUT = [
			create_error_token({ token: 'token_note', message: ERRORS.NO_SPACE_BEFORE_UNDERSCORE }),
			create_error_token({ token: 'token_', message: ERRORS.INVALID_TOKEN_END('token') }),
			create_error_token({ token: '._note', message: ERRORS.NO_SPACE_BEFORE_UNDERSCORE }),
			create_error_token({ token: ']_note', message: ERRORS.NO_SPACE_BEFORE_UNDERSCORE }),
		]

		expect(tokenize_input(INPUT)).toEqual(EXPECTED_OUTPUT)
	})

	test('valid clause notation', () => {
		const INPUT = '(imp) (implicit-situational) [(imp) (imp)] (imp).'

		const EXPECTED_OUTPUT = [
			create_token({ token: '(imp)', type: TOKEN_TYPE.NOTE }),
			create_token({ token: '(implicit-situational)', type: TOKEN_TYPE.NOTE }),
			create_token({ token: '[', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '(imp)', type: TOKEN_TYPE.NOTE }),
			create_token({ token: '(imp)', type: TOKEN_TYPE.NOTE }),
			create_token({ token: ']', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '(imp)', type: TOKEN_TYPE.NOTE }),
			create_token({ token: '.', type: TOKEN_TYPE.PUNCTUATION }),
		]

		expect(tokenize_input(INPUT)).toEqual(EXPECTED_OUTPUT)
	})

	describe('all valid clause notations', () => {
		test.each(CLAUSE_NOTATIONS.map(notation => [[notation]]))('%s', test_text => {
			const EXPECTED_OUTPUT = [
				create_token({ token: test_text[0], type: TOKEN_TYPE.NOTE }),
			]

			expect(tokenize_input(test_text[0])).toEqual(EXPECTED_OUTPUT)
		})
	})

	test('invalid clause notation', () => {
		const INPUT = "(imp imp) token(imp) (imp)token (implicit_situational) (imperative) (alt) (Paul's) (test )"

		const EXPECTED_OUTPUT = [
			create_error_token({ token: '(imp', message: ERRORS.MISSING_CLOSING_PAREN }),
			create_error_token({ token: 'imp)', message: ERRORS.MISSING_OPENING_PAREN }),
			create_pronoun_token({ pronoun: 'token', referent_token: create_word_token({ token: 'imp' }) }),		// tokenizing at this time does not differentiate from a pronoun referent
			create_error_token({ token: '(imp)token', message: ERRORS.INVALID_TOKEN_END('(imp)') }),
			create_error_token({ token: '(implicit_situational)', message: 'This clause notation is not recognized. Did you mean (implicit-situational)?' }),
			create_error_token({ token: '(imperative)', message: 'This clause notation is not recognized. Did you mean (imp)?' }),
			create_error_token({ token: '(alt)', message: 'This clause notation is not recognized. Did you mean (alternate-1), (alternate-2), (alternate-3), (alternate-4), or (alternate-5)?' }),
			create_error_token({ token: "(Paul's)", message: 'This clause notation is not recognized.' }),
			create_error_token({ token: '(test', message: ERRORS.MISSING_CLOSING_PAREN }),
			create_error_token({ token: ')', message: ERRORS.MISSING_OPENING_PAREN }),
		]

		expect(tokenize_input(INPUT)).toEqual(EXPECTED_OUTPUT)
	})

	describe('all valid function words lowercase', () => {
		test.each(Array.from(FUNCTION_WORDS))('%s', (word, tag) => {
			const EXPECTED_OUTPUT = [
				create_token({ token: word, type: TOKEN_TYPE.FUNCTION_WORD, tag }),
			]

			expect(tokenize_input(word)).toEqual(EXPECTED_OUTPUT)
		})
	})

	describe('all valid function words uppercase', () => {
		test.each(Array.from(FUNCTION_WORDS))('%s', (word, tag) => {
			const upper_word = word.toUpperCase()
			const EXPECTED_OUTPUT = [
				create_token({ token: upper_word, type: TOKEN_TYPE.FUNCTION_WORD, tag }),
			]

			expect(tokenize_input(upper_word)).toEqual(EXPECTED_OUTPUT)
		})
	})

	test('valid opening brackets', () => {
		const INPUT = '[[ [" "[ [token [. [? [] [[token]]'

		const EXPECTED_OUTPUT = [
			create_token({ token: '[', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '[', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '[', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '"', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '"', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '[', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '[', type: TOKEN_TYPE.PUNCTUATION }),
			create_word_token({ token: 'token' }),
			create_token({ token: '[', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '.', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '[', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '?', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '[', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: ']', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '[', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '[', type: TOKEN_TYPE.PUNCTUATION }),
			create_word_token({ token: 'token' }),
			create_token({ token: ']', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: ']', type: TOKEN_TYPE.PUNCTUATION }),
		]

		expect(tokenize_input(INPUT)).toEqual(EXPECTED_OUTPUT)
	})

	test('invalid opening brackets', () => {
		const INPUT = '.[ ,[ ?[ ][ token[ :['

		const EXPECTED_OUTPUT = [
			create_error_token({ token: '.[', message: ERRORS.NO_SPACE_BEFORE_OPENING_BRACKET }),
			create_error_token({ token: ',[', message: ERRORS.NO_SPACE_BEFORE_OPENING_BRACKET }),
			create_error_token({ token: '?[', message: ERRORS.NO_SPACE_BEFORE_OPENING_BRACKET }),
			create_error_token({ token: '][', message: ERRORS.NO_SPACE_BEFORE_OPENING_BRACKET }),
			create_error_token({ token: 'token[', message: ERRORS.NO_SPACE_BEFORE_OPENING_BRACKET }),
			create_error_token({ token: ':[', message: ERRORS.NO_SPACE_BEFORE_OPENING_BRACKET }),
		]

		expect(tokenize_input(INPUT)).toEqual(EXPECTED_OUTPUT)
	})

	test('valid punctuation', () => {
		const INPUT = '." ". ?"] token]". "], token]] token, 5:5'

		const EXPECTED_OUTPUT = [
			create_token({ token: '.', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '"', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '"', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '.', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '?', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '"', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: ']', type: TOKEN_TYPE.PUNCTUATION }),
			create_word_token({ token: 'token' }),
			create_token({ token: ']', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '"', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '.', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '"', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: ']', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: ',', type: TOKEN_TYPE.PUNCTUATION }),
			create_word_token({ token: 'token' }),
			create_token({ token: ']', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: ']', type: TOKEN_TYPE.PUNCTUATION }),
			create_word_token({ token: 'token' }),
			create_token({ token: ',', type: TOKEN_TYPE.PUNCTUATION }),
			create_word_token({ token: '5' }),
			create_token({ token: ':', type: TOKEN_TYPE.LOOKUP_WORD, lookup_terms: ['-ReferenceMarker'], tag: { 'syntax': 'verse_ref_colon' } }),
			create_word_token({ token: '5' }),
		]

		expect(tokenize_input(INPUT)).toEqual(EXPECTED_OUTPUT)
	})

	test('single quote variants', () => {
		const INPUT = "Paul's Paul’s Jesus’ Jesus' sons’-C you(Paul’s)"

		const EXPECTED_OUTPUT = [
			create_word_token({ token: 'Paul\'s', lookup_term: 'Paul' }),
			create_word_token({ token: 'Paul\'s', lookup_term: 'Paul' }),
			create_word_token({ token: 'Jesus\'', lookup_term: 'Jesus' }),
			create_word_token({ token: "Jesus'", lookup_term: 'Jesus' }),
			create_word_token({ token: 'sons\'-C', lookup_term: 'sons', sense: 'C' }),
			create_pronoun_token({ pronoun: 'you', referent_token: create_word_token({ token: 'Paul\'s', lookup_term: 'Paul' }) }),
		]

		expect(tokenize_input(INPUT)).toEqual(EXPECTED_OUTPUT)
	})

	test('double quote variants', () => {
		const INPUT = '[“Yes.”] " “'

		const EXPECTED_OUTPUT = [
			create_token({ token: '[', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '"', type: TOKEN_TYPE.PUNCTUATION }),
			create_word_token({ token: 'Yes' }),
			create_token({ token: '.', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '"', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: ']', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '"', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '"', type: TOKEN_TYPE.PUNCTUATION }),
		]

		expect(tokenize_input(INPUT)).toEqual(EXPECTED_OUTPUT)
	})

	test('invalid single characters', () => {
		const INPUT = '( ) / * + ;'

		const EXPECTED_OUTPUT = [
			create_error_token({ token: '(', message: ERRORS.MISSING_CLOSING_PAREN }),
			create_error_token({ token: ')', message: ERRORS.MISSING_OPENING_PAREN }),
			create_error_token({ token: '/', message: ERRORS.INVALID_COMPLEX_PAIRING_SYNTAX }),
			create_error_token({ token: '*', message: ERRORS.UNRECOGNIZED_CHAR }),
			create_error_token({ token: '+', message: ERRORS.UNRECOGNIZED_CHAR }),
			create_error_token({ token: ';', message: ERRORS.UNRECOGNIZED_CHAR }),
		]

		expect(tokenize_input(INPUT)).toEqual(EXPECTED_OUTPUT)
	})

	test('valid unit pairing', () => {
		const INPUT = '5/10 .5/2 5/2.5 .5/2.5 2.5/5. [2/2.5.]'

		// these pairings are parsed as 'simple-complex', and determined to be 'metric-biblical' at a later stage
		const EXPECTED_OUTPUT = [
			create_pairing({ left_token: create_word_token({ token: '5' }), right_token: create_word_token({ token: '10' }), pairing_type: 'simple-complex' }),
			create_pairing({ left_token: create_word_token({ token: '.5' }), right_token: create_word_token({ token: '2' }), pairing_type: 'simple-complex' }),
			create_pairing({ left_token: create_word_token({ token: '5' }), right_token: create_word_token({ token: '2.5' }), pairing_type: 'simple-complex' }),
			create_pairing({ left_token: create_word_token({ token: '.5' }), right_token: create_word_token({ token: '2.5' }), pairing_type: 'simple-complex' }),
			create_pairing({ left_token: create_word_token({ token: '2.5' }), right_token: create_word_token({ token: '5' }), pairing_type: 'simple-complex' }),
			create_token({ token: '.', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '[', type: TOKEN_TYPE.PUNCTUATION }),
			create_pairing({ left_token: create_word_token({ token: '2' }), right_token: create_word_token({ token: '2.5' }), pairing_type: 'simple-complex' }),
			create_token({ token: '.', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: ']', type: TOKEN_TYPE.PUNCTUATION }),
		]

		expect(tokenize_input(INPUT)).toEqual(EXPECTED_OUTPUT)
	})

	test('valid complex pairing', () => {
		const INPUT = "simple/complex simple's/complex's simples'/complexs' simples'-A/complexs' simple-A/complex-B. [simple/complex]"

		const EXPECTED_OUTPUT = [
			create_pairing({ left_token: create_word_token({ token: 'simple' }), right_token: create_word_token({ token: 'complex' }), pairing_type: 'simple-complex' }),
			create_pairing({ left_token: create_word_token({ token: "simple's", lookup_term: 'simple' }), right_token: create_word_token({ token: "complex's", lookup_term: 'complex' }), pairing_type: 'simple-complex' }),
			create_pairing({ left_token: create_word_token({ token: "simples'", lookup_term: 'simples' }), right_token: create_word_token({ token: "complexs'", lookup_term: 'complexs' }), pairing_type: 'simple-complex' }),
			create_pairing({ left_token: create_word_token({ token: "simples'-A", lookup_term: 'simples', sense: 'A' }), right_token: create_word_token({ token: "complexs'", lookup_term: 'complexs' }), pairing_type: 'simple-complex' }),
			create_pairing({ left_token: create_word_token({ token: 'simple-A', lookup_term: 'simple', sense: 'A' }), right_token: create_word_token({ token: 'complex-B', lookup_term: 'complex', sense: 'B' }), pairing_type: 'simple-complex' }),
			create_token({ token: '.', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '[', type: TOKEN_TYPE.PUNCTUATION }),
			create_pairing({ left_token: create_word_token({ token: 'simple' }), right_token: create_word_token({ token: 'complex' }), pairing_type: 'simple-complex' }),
			create_token({ token: ']', type: TOKEN_TYPE.PUNCTUATION }),
		]

		expect(tokenize_input(INPUT)).toEqual(EXPECTED_OUTPUT)
	})

	test('invalid complex pairing', () => {
		const INPUT = '/complex simple/ / simple//complex simple/.complex simple./complex you(simple/)'

		const EXPECTED_OUTPUT = [
			create_error_token({ token: '/complex', message: ERRORS.INVALID_COMPLEX_PAIRING_SYNTAX }),
			create_error_token({ token: 'simple/', message: ERRORS.INVALID_COMPLEX_PAIRING_SYNTAX }),
			create_error_token({ token: '/', message: ERRORS.INVALID_COMPLEX_PAIRING_SYNTAX }),
			create_error_token({ token: 'simple//complex', message: ERRORS.INVALID_COMPLEX_PAIRING_SYNTAX }),
			create_error_token({ token: 'simple/', message: ERRORS.INVALID_COMPLEX_PAIRING_SYNTAX }),
			create_error_token({ token: '.complex', message: ERRORS.INVALID_TOKEN_END('.') }),
			create_word_token({ token: 'simple' }),
			create_error_token({ token: './complex', message: ERRORS.INVALID_TOKEN_END('.') }),
			create_error_token({ token: 'you(simple/)', message: ERRORS.INVALID_COMPLEX_PAIRING_SYNTAX }),
		]

		expect(tokenize_input(INPUT)).toEqual(EXPECTED_OUTPUT)
	})

	test('valid literal pairing', () => {
		const INPUT = "dynamic|literal dynamic's|literal's dynamics'|literals' dynamics'-A|literals' dynamic-A|literal-B. [dynamic|literal]"

		const EXPECTED_OUTPUT = [
			create_pairing({ left_token: create_word_token({ token: 'dynamic' }), right_token: create_word_token({ token: 'literal' }), pairing_type: 'dynamic-literal' }),
			create_pairing({ left_token: create_word_token({ token: "dynamic's", lookup_term: 'dynamic' }), right_token: create_word_token({ token: "literal's", lookup_term: 'literal' }), pairing_type: 'dynamic-literal' }),
			create_pairing({ left_token: create_word_token({ token: "dynamics'", lookup_term: 'dynamics' }), right_token: create_word_token({ token: "literals'", lookup_term: 'literals' }), pairing_type: 'dynamic-literal' }),
			create_pairing({ left_token: create_word_token({ token: "dynamics'-A", lookup_term: 'dynamics', sense: 'A' }), right_token: create_word_token({ token: "literals'", lookup_term: 'literals' }), pairing_type: 'dynamic-literal' }),
			create_pairing({ left_token: create_word_token({ token: 'dynamic-A', lookup_term: 'dynamic', sense: 'A' }), right_token: create_word_token({ token: 'literal-B', lookup_term: 'literal', sense: 'B' }), pairing_type: 'dynamic-literal' }),
			create_token({ token: '.', type: TOKEN_TYPE.PUNCTUATION }),
			create_token({ token: '[', type: TOKEN_TYPE.PUNCTUATION }),
			create_pairing({ left_token: create_word_token({ token: 'dynamic' }), right_token: create_word_token({ token: 'literal' }), pairing_type: 'dynamic-literal' }),
			create_token({ token: ']', type: TOKEN_TYPE.PUNCTUATION }),
		]

		expect(tokenize_input(INPUT)).toEqual(EXPECTED_OUTPUT)
	})

	test('invalid literal pairing', () => {
		const INPUT = '|literal dynamic| | dynamic||literal dynamic|.literal dynamic.|literal'

		const EXPECTED_OUTPUT = [
			create_error_token({ token: '|literal', message: ERRORS.INVALID_LITERAL_PAIRING_SYNTAX }),
			create_error_token({ token: 'dynamic|', message: ERRORS.INVALID_LITERAL_PAIRING_SYNTAX }),
			create_error_token({ token: '|', message: ERRORS.INVALID_LITERAL_PAIRING_SYNTAX }),
			create_error_token({ token: 'dynamic||literal', message: ERRORS.INVALID_LITERAL_PAIRING_SYNTAX }),
			create_error_token({ token: 'dynamic|', message: ERRORS.INVALID_LITERAL_PAIRING_SYNTAX }),
			create_error_token({ token: '.literal', message: ERRORS.INVALID_TOKEN_END('.') }),
			create_word_token({ token: 'dynamic' }),
			create_error_token({ token: '.|literal', message: ERRORS.INVALID_TOKEN_END('.') }),
		]

		expect(tokenize_input(INPUT)).toEqual(EXPECTED_OUTPUT)
	})

	test('each top-level token records its range in the input', () => {
		const ranges = tokenize_with_ranges('John  saw all.').map(({ token, source_range }) => [token, source_range])

		expect(ranges).toEqual([
			['John', { start: 0, end: 4 }],
			['saw', { start: 6, end: 9 }],
			['all', { start: 10, end: 13 }],
			['.', { start: 13, end: 14 }],
		])
	})
})
