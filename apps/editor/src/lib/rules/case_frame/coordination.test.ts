import { apply_transform_and_sense_rules } from '#lib/parser/index.js'
import { clausify, flatten_sentences } from '#lib/parser/clausify.js'
import { tokenize_input } from '#lib/parser/tokenize.js'
import { RULES, apply_rules } from '#lib/rules/index.js'
import { TOKEN_TYPE, create_lookup_result } from '#lib/token.js'
import { describe, expect, test } from 'vitest'
import type { Token } from '#lib/types.js'

const VERB_CATEGORIZATIONS: Record<string, string> = {
	go: 'A',
	see: 'AB',
	say: 'AH',
}

const CONJUNCTIONS = ['and', 'or']

// stand-in for the ontology lookup
function parse_with_lookups(text: string): Token[] {
	let sentences = clausify(tokenize_input(text))
	sentences = apply_rules({ sentences, rules: RULES.SYNTAX })
	sentences = apply_rules({ sentences, rules: RULES.LOOKUP })
	for (const token of flatten_sentences(sentences).filter(token => token.type === TOKEN_TYPE.LOOKUP_WORD)) {
		const stem = token.token.toLowerCase()
		const categorization = VERB_CATEGORIZATIONS[stem]
		const part_of_speech = categorization ? 'Verb' : CONJUNCTIONS.includes(stem) ? 'Conjunction' : 'Noun'
		token.lookup_results = [create_lookup_result({ stem, part_of_speech, categorization: categorization ?? '', ontology_status: 'in ontology' })]
	}
	sentences = apply_transform_and_sense_rules(apply_rules({ sentences, rules: RULES.PART_OF_SPEECH }))
	return flatten_sentences(sentences)
}

function roles_by_token(tokens: Token[]): Record<string, string> {
	return Object.fromEntries(tokens.filter(token => token.tag['role']).map(token => [token.token, token.tag['role']]))
}

function argument_contexts({ tokens, verb, role }: { tokens: Token[], verb: string, role: string }) {
	const verb_token = tokens.find(token => token.token === verb)
	const argument = verb_token?.lookup_results[0].case_frame.result.valid_arguments.find(({ role_tag }) => role_tag === role)
	return argument?.trigger_contexts ?? []
}

function argument_tokens(options: { tokens: Token[], verb: string, role: string }): string[] {
	return argument_contexts(options).map(({ trigger_token }) => trigger_token.token)
}

function argument_clause_texts(options: { tokens: Token[], verb: string, role: string }): string[] {
	return argument_contexts(options).map(({ tokens, trigger_index }) => tokens[trigger_index].sub_tokens.map(({ token }) => token).join(' '))
}

function argument_clause_roles(options: { tokens: Token[], verb: string, role: string }): string[] {
	return argument_contexts(options).map(({ tokens, trigger_index }) => tokens[trigger_index].tag['role'])
}

describe('coordinated arguments', () => {
	test('every noun coordinated with an agent before the Verb is an agent', () => {
		const tokens = parse_with_lookups('John and Mary go.')

		expect(roles_by_token(tokens)).toEqual({ John: 'agent', Mary: 'agent' })
		expect(argument_tokens({ tokens, verb: 'go', role: 'agent' })).toEqual(['John', 'Mary'])
	})

	test('every noun coordinated with a patient after the Verb is a patient', () => {
		const tokens = parse_with_lookups('John see Mary, Peter and James.')

		expect(roles_by_token(tokens)).toEqual({ John: 'agent', Mary: 'patient', Peter: 'patient', James: 'patient' })
		expect(argument_tokens({ tokens, verb: 'see', role: 'patient' })).toEqual(['Mary', 'Peter', 'James'])
	})

	describe('patient clauses', () => {
		const role = 'patient_clause_different_participant'

		test('a clause starting with and/or is coordinated with the patient clause before it', () => {
			const tokens = parse_with_lookups('John say [that Mary go] [and Peter go].')

			expect(argument_clause_texts({ tokens, verb: 'say', role })).toEqual(['[ that Mary go ]', '[ and Peter go ]'])
			expect(argument_clause_roles({ tokens, verb: 'say', role })).toEqual([role, role])
		})

		test('clauses separated by commas are coordinated', () => {
			const tokens = parse_with_lookups('John say [that Mary go], [Peter go] [or James go].')

			expect(argument_clause_texts({ tokens, verb: 'say', role })).toEqual(['[ that Mary go ]', '[ Peter go ]', '[ or James go ]'])
		})
	})
})
