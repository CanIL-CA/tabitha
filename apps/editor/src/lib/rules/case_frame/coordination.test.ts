import { apply_transform_and_sense_rules } from '#lib/parser/index.js'
import { clausify, flatten_sentences } from '#lib/parser/clausify.js'
import { tokenize_input } from '#lib/parser/tokenize.js'
import { RULES, apply_rules } from '#lib/rules/index.js'
import { TOKEN_TYPE, create_lookup_result } from '#lib/token.js'
import { describe, expect, test } from 'vitest'
import type { LookupResult, Token } from '#lib/types.js'

type StubLookup = Pick<LookupResult, 'part_of_speech'> & Partial<Pick<LookupResult, 'categorization' | 'sense'>>

const STUB_LOOKUPS: Record<string, StubLookup> = {
	go: { part_of_speech: 'Verb', categorization: 'A' },
	see: { part_of_speech: 'Verb', categorization: 'AB' },
	say: { part_of_speech: 'Verb', categorization: 'AH' },
	bury: { part_of_speech: 'Verb', categorization: 'ABE', sense: 'A' },
	agree: { part_of_speech: 'Verb', categorization: 'AB', sense: 'A' },
	argue: { part_of_speech: 'Verb', categorization: 'AH', sense: 'B' },
	be: { part_of_speech: 'Verb', categorization: 'AC' },
	afraid: { part_of_speech: 'Adjective', categorization: 'GBC', sense: 'B' },
	and: { part_of_speech: 'Conjunction' },
	or: { part_of_speech: 'Conjunction' },
	in: { part_of_speech: 'Adposition' },
	with: { part_of_speech: 'Adposition' },
	about: { part_of_speech: 'Adposition' },
}

// stand-in for the ontology lookup
function parse_with_lookups(text: string): Token[] {
	let sentences = clausify(tokenize_input(text))
	sentences = apply_rules({ sentences, rules: RULES.SYNTAX })
	sentences = apply_rules({ sentences, rules: RULES.LOOKUP })
	for (const token of flatten_sentences(sentences).filter(token => token.type === TOKEN_TYPE.LOOKUP_WORD)) {
		const stem = token.token.toLowerCase()
		const stub = STUB_LOOKUPS[stem] ?? { part_of_speech: 'Noun' }
		token.lookup_results = [create_lookup_result({ stem, ...stub, ontology_status: 'in ontology' })]
	}
	sentences = apply_transform_and_sense_rules(apply_rules({ sentences, rules: RULES.PART_OF_SPEECH }))
	return flatten_sentences(sentences)
}

function roles_by_token(tokens: Token[]): Record<string, string> {
	return Object.fromEntries(tokens.filter(token => token.tag['role']).map(token => [token.token, token.tag['role']]))
}

function argument_contexts({ tokens, word, role }: { tokens: Token[], word: string, role: string }) {
	const word_token = tokens.find(token => token.token === word)
	const argument = word_token?.lookup_results[0].case_frame.result.valid_arguments.find(({ role_tag }) => role_tag === role)
	return argument?.trigger_contexts ?? []
}

function argument_tokens(options: { tokens: Token[], word: string, role: string }): string[] {
	return argument_contexts(options).map(({ trigger_token }) => trigger_token.token)
}

function argument_clause_texts(options: { tokens: Token[], word: string, role: string }): string[] {
	return argument_contexts(options).map(({ tokens, trigger_index }) => tokens[trigger_index].sub_tokens.map(({ token }) => token).join(' '))
}

function argument_clause_roles(options: { tokens: Token[], word: string, role: string }): string[] {
	return argument_contexts(options).map(({ tokens, trigger_index }) => tokens[trigger_index].tag['role'])
}

function function_word_flags({ tokens, word }: { tokens: Token[], word: string }): boolean[] {
	return tokens.filter(token => token.token === word).map(token => token.type === TOKEN_TYPE.FUNCTION_WORD)
}

describe('coordinated arguments', () => {
	test('every noun coordinated with an agent before the Verb is an agent', () => {
		const tokens = parse_with_lookups('John and Mary go.')

		expect(roles_by_token(tokens)).toEqual({ John: 'agent', Mary: 'agent' })
		expect(argument_tokens({ tokens, word: 'go', role: 'agent' })).toEqual(['John', 'Mary'])
	})

	test('every noun coordinated with a patient after the Verb is a patient', () => {
		const tokens = parse_with_lookups('John see Mary, Peter and James.')

		expect(roles_by_token(tokens)).toEqual({ John: 'agent', Mary: 'patient', Peter: 'patient', James: 'patient' })
		expect(argument_tokens({ tokens, word: 'see', role: 'patient' })).toEqual(['Mary', 'Peter', 'James'])
	})

	describe('adpositions', () => {
		test('the adposition before each coordinated argument becomes a function word', () => {
			const tokens = parse_with_lookups('John bury Mary in Egypt and in Canaan.')

			expect(argument_tokens({ tokens, word: 'bury', role: 'destination' })).toEqual(['Egypt', 'Canaan'])
			expect(function_word_flags({ tokens, word: 'in' })).toEqual([true, true])
		})

		test('the adposition before each coordinated argument directly after the Verb becomes a function word', () => {
			const tokens = parse_with_lookups('John agree with Mary and with Peter.')

			expect(argument_tokens({ tokens, word: 'agree', role: 'patient' })).toEqual(['Mary', 'Peter'])
			expect(function_word_flags({ tokens, word: 'with' })).toEqual([true, true])
		})

		test('the adposition before each coordinated argument of an Adjective becomes an argument function word', () => {
			const tokens = parse_with_lookups('John be afraid of Mary and of Peter.')
			const of_tags = tokens.filter(token => token.token === 'of').map(token => token.tag)

			expect(argument_tokens({ tokens, word: 'afraid', role: 'nominal_argument' })).toEqual(['Mary', 'Peter'])
			expect(roles_by_token(tokens)).toMatchObject({ Mary: 'adjective_nominal_argument', Peter: 'adjective_nominal_argument' })
			expect(of_tags).toEqual([{ 'pre_np_adposition': 'adjective_argument' }, { 'pre_np_adposition': 'adjective_argument' }])
		})

		test('an adjective argument with a shared adposition is coordinated', () => {
			const tokens = parse_with_lookups('John be afraid of Mary and Peter.')

			expect(argument_tokens({ tokens, word: 'afraid', role: 'nominal_argument' })).toEqual(['Mary', 'Peter'])
		})

		test('a repeated genitive is coordinated with the first genitive, not the head noun', () => {
			const tokens = parse_with_lookups('John see the brother of James and of John.')

			expect(argument_tokens({ tokens, word: 'see', role: 'patient' })).toEqual(['brother'])
		})
	})

	describe('patient clauses', () => {
		const role = 'patient_clause_different_participant'

		test('a clause starting with and/or is coordinated with the patient clause before it', () => {
			const tokens = parse_with_lookups('John say [that Mary go] [and Peter go].')

			expect(argument_clause_texts({ tokens, word: 'say', role })).toEqual(['[ that Mary go ]', '[ and Peter go ]'])
			expect(argument_clause_roles({ tokens, word: 'say', role })).toEqual([role, role])
		})

		test('clauses separated by commas are coordinated', () => {
			const tokens = parse_with_lookups('John say [that Mary go], [Peter go] [or James go].')

			expect(argument_clause_texts({ tokens, word: 'say', role })).toEqual(['[ that Mary go ]', '[ Peter go ]', '[ or James go ]'])
		})

		test('the complementizer of each coordinated clause becomes a function word', () => {
			const tokens = parse_with_lookups('John argue [about Mary go] [and about Peter go].')

			expect(argument_clause_texts({ tokens, word: 'argue', role })).toEqual(['[ about Mary go ]', '[ and about Peter go ]'])
			expect(argument_clause_roles({ tokens, word: 'argue', role })).toEqual([role, role])
			expect(function_word_flags({ tokens, word: 'about' })).toEqual([true, true])
			expect(function_word_flags({ tokens, word: 'and' })).toEqual([false])
		})
	})
})
