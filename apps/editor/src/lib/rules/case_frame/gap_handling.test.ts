import { apply_transform_and_sense_rules } from '#lib/parser/index.js'
import { clausify } from '#lib/parser/clausify.js'
import { tokenize_input } from '#lib/parser/tokenize.js'
import { RULES, apply_rules } from '#lib/rules/index.js'
import { ANALYZER_CHECKER_RULES } from '#lib/analyzer/checker_rules.js'
import { TOKEN_TYPE, create_lookup_result } from '#lib/token.js'
import { describe, expect, test } from 'vitest'
import type { PartOfSpeech } from '@tabitha/types'
import type { TokenRule } from '#lib/rules/types.js'
import type { Token } from '#lib/types.js'

// stand-in for the ontology: the categorization of each sense, in sense order (copied from the Ontology where possible)
const VERB_SENSES: Record<string, string[]> = {
	be: ['AC'],
	do: ['AB'],
	leave: ['Ab____g__', 'Ab____g__', 'AB____g__', 'AB_______'],
	go: ['A'],
	want: ['A_____gH_', 'A______H_', 'AB____g__', 'AB_______'],
	choose: ['AB', 'AB', 'AH'],
	tell: ['AB___f_H_', 'AB_____H_', 'AB__Ef___', 'AB__ef___', 'AB_____H_'],
	try: ['AH'],
	see: ['Ab___f___', 'A______H_', 'A______H_', 'AB_______'],
	kill: ['AB'],
}

const OTHER_PARTS_OF_SPEECH: Record<string, PartOfSpeech> = {
	by: 'Adposition',
}

const NOUN_FEATURES: Record<string, Record<string, string>> = {
	john: { Gender: 'Masculine' },
	peter: { Gender: 'Masculine' },
	person: { Gender: 'Masculine' },
	man: { Gender: 'Masculine' },
}

// the verb stem and form of each inflected verb
const VERB_FORMS: Record<string, [string, string]> = {
	did: ['do', 'past'],
	wanted: ['want', 'past'],
	chose: ['choose', 'past'],
	told: ['tell', 'past'],
	tried: ['try', 'past'],
	saw: ['see', 'past'],
	seen: ['see', 'perfect'],
	killed: ['kill', 'past'],
	be: ['be', 'stem'],
}

function parse_with_lookups(text: string): Token[] {
	let sentences = clausify(tokenize_input(text))
	sentences = apply_rules({ sentences, rules: RULES.SYNTAX })
	sentences = apply_rules({ sentences, rules: RULES.LOOKUP })
	for (const token of sentences.flatMap(({ clause }) => flatten(clause)).filter(token => token.type === TOKEN_TYPE.LOOKUP_WORD)) {
		const [stem, specified_sense = ''] = (token.lookup_terms[0] ?? token.token).toLowerCase().split('-')
		const [verb_stem, form] = VERB_FORMS[stem] ?? [stem, 'stem']
		const senses = VERB_SENSES[verb_stem]
		// like the form lookup, features come from the written word, eg. 'who' has none even though it is looked up as 'person'
		const lexical_features = NOUN_FEATURES[token.token.toLowerCase()]
		token.specified_sense ||= specified_sense
		token.lookup_results = senses
			? senses.map((categorization, index) => create_lookup_result({ stem: verb_stem, sense: String.fromCharCode(65 + index), part_of_speech: 'Verb', categorization, form, ontology_status: 'in ontology' }))
			: [create_lookup_result({ stem, part_of_speech: OTHER_PARTS_OF_SPEECH[stem] ?? 'Noun', ontology_status: 'in ontology', lexical_features })]
	}
	sentences = apply_transform_and_sense_rules(apply_rules({ sentences, rules: RULES.PART_OF_SPEECH }))
	return sentences.map(({ clause }) => clause)
}

function flatten(token: Token): Token[] {
	return [token, ...token.sub_tokens.flatMap(flatten)]
}

function relative_clause_of(text: string): Token {
	return parse_with_lookups(text).flatMap(flatten).find(token => token.tag['clause_type']?.includes('relative_clause'))!
}

function text_of(token: Token): string {
	return token.type === TOKEN_TYPE.CLAUSE ? token.sub_tokens.map(text_of).join(' ') : token.token
}

function is_gap_ambiguous(clause: Token): boolean {
	return flatten(clause).some(token => token.tag['gap_reading'] === 'ambiguous')
}

function warnings_on({ text, rules, stem }: { text: string; rules: TokenRule[]; stem: string }): string[] {
	const sentences = apply_rules({ sentences: parse_with_lookups(text).map(clause => ({ clause })), rules })
	const token = sentences.flatMap(({ clause }) => flatten(clause)).find(token => token.lookup_results[0]?.stem === stem)!
	return token.messages.filter(({ label }) => label === 'warning').map(({ message }) => message)
}

function interrogative_clause_of(text: string): Token {
	return parse_with_lookups(text).flatMap(flatten).find(token => token.type === TOKEN_TYPE.CLAUSE && token.tag['interrogative'])!
}

function nested_clause_of(clause: Token): Token {
	return clause.sub_tokens.find(token => token.type === TOKEN_TYPE.CLAUSE)!
}

describe('relative clause gaps inside a patient clause', () => {
	test('the gap is the object when the inner verb requires a patient', () => {
		const clause = relative_clause_of('John did the thing [that Peter wanted [to do]].')

		expect(text_of(clause)).toBe('[ that Peter wanted [ GAP_SAME_SUB to do GAP_REL ] ]')
		expect(clause.tag['gap_reading']).toBe('object')
		expect(is_gap_ambiguous(clause)).toBe(false)
	})

	test('the gap is the subject when the outer verb only takes a different-participant clause', () => {
		const clause = relative_clause_of('John saw the person [that Peter told [to leave]].')

		expect(text_of(clause)).toBe('[ that Peter told [ GAP_REL to leave ] ]')
		expect(nested_clause_of(clause).tag['clause_type']).toBe('patient_clause_different_participant')
		expect(is_gap_ambiguous(clause)).toBe(false)
	})

	test('the gap is the object when the outer verb only takes a same-participant clause', () => {
		const clause = relative_clause_of('John saw the person [that Peter tried [to leave]].')

		expect(text_of(clause)).toBe('[ that Peter tried [ GAP_SAME_SUB to leave GAP_REL ] ]')
	})

	test('when both readings are valid, a person is the subject, and is ambiguous', () => {
		const clause = relative_clause_of('John saw the person [that Peter wanted [to leave]].')

		expect(text_of(clause)).toBe('[ that Peter wanted [ GAP_REL to leave ] ]')
		expect(nested_clause_of(clause).tag['clause_type']).toBe('patient_clause_different_participant')
		expect(is_gap_ambiguous(clause)).toBe(true)
	})

	test('when both readings are valid, a non-person is the object, and is ambiguous', () => {
		const clause = relative_clause_of('John saw the thing [that Peter wanted [to leave]].')

		expect(text_of(clause)).toBe('[ that Peter wanted [ GAP_SAME_SUB to leave GAP_REL ] ]')
		expect(is_gap_ambiguous(clause)).toBe(true)
	})

	test('a written sense that requires a patient decides the object, and is not ambiguous', () => {
		const clause = relative_clause_of('John saw the person [that Peter wanted [to leave-C]].')

		expect(text_of(clause)).toBe('[ that Peter wanted [ GAP_SAME_SUB to leave-C GAP_REL ] ]')
		expect(is_gap_ambiguous(clause)).toBe(false)
	})

	test('a written sense that allows both readings is still ambiguous', () => {
		const clause = relative_clause_of('John saw the person [that Peter wanted [to leave-B]].')

		expect(text_of(clause)).toBe('[ that Peter wanted [ GAP_REL to leave-B ] ]')
		expect(is_gap_ambiguous(clause)).toBe(true)
	})

	test('a subject gap of a patient_from_clause verb is tagged to be brought out as its patient', () => {
		const clause = relative_clause_of('John saw the person [that Peter chose [to leave]].')

		expect(text_of(clause)).toBe('[ that Peter chose [ GAP_REL to leave ] ]')
		expect(nested_clause_of(clause).tag['gap']).toBe('patient_from_clause')
	})

	test('the gap is the subject when the inner verb already has an object', () => {
		const clause = relative_clause_of('John saw the person [that Peter wanted [to see John]].')

		expect(text_of(clause)).toBe('[ that Peter wanted [ GAP_REL to see John ] ]')
		expect(clause.tag['gap_reading']).toBeUndefined()
	})

	test('the gap is the object when the inner clause has its own subject', () => {
		const clause = relative_clause_of('John did the thing [that Peter wanted [John to do]].')

		expect(text_of(clause)).toBe('[ that Peter wanted [ John to do GAP_REL ] ]')
		expect(clause.tag['gap_reading']).toBeUndefined()
	})

	test('the gap follows a dangling adposition in the inner clause', () => {
		const clause = relative_clause_of('John saw the house [that Peter wanted [to go to]].')

		expect(text_of(clause)).toBe('[ that Peter wanted [ GAP_SAME_SUB to go to GAP_REL ] ]')
	})
})

describe('interrogative gaps inside a patient clause', () => {
	test('the gap is the object when the inner verb requires a patient', () => {
		const clause = interrogative_clause_of('What did Peter want [to do]?')

		expect(text_of(clause)).toBe('What did Peter want [ GAP_SAME_SUB to do GAP_INTV_N ] ?')
		expect(clause.tag['gap_reading']).toBe('object')
		expect(is_gap_ambiguous(clause)).toBe(false)
	})

	test('the gap is the subject when the outer verb only takes a different-participant clause', () => {
		const clause = interrogative_clause_of('Who did Peter tell [to leave]?')

		expect(text_of(clause)).toBe('Who did Peter tell [ GAP_INTV_N to leave ] ?')
		expect(is_gap_ambiguous(clause)).toBe(false)
	})

	test('when both readings are valid, a questioned person is the subject, and is ambiguous', () => {
		const clause = interrogative_clause_of('Which man did Peter want [to leave]?')

		expect(text_of(clause)).toBe('Which man did Peter want [ GAP_INTV_N to leave ] ?')
		expect(is_gap_ambiguous(clause)).toBe(true)
	})

	test("'who' is a person when both readings are valid", () => {
		const clause = interrogative_clause_of('Who did Peter want [to leave]?')

		expect(text_of(clause)).toBe('Who did Peter want [ GAP_INTV_N to leave ] ?')
	})

	test('the gap is the subject of a passive inner verb', () => {
		const clause = interrogative_clause_of('What did Peter want [to be seen by John]?')

		expect(clause.tag['gap_reading']).toBe('subject')
		expect(text_of(clause)).toBe('What did Peter want [ GAP_INTV_N to be seen by John ] ?')
	})

	test('when both readings are valid, a questioned thing is the object, and is ambiguous', () => {
		const clause = interrogative_clause_of('What did Peter want [to leave]?')

		expect(text_of(clause)).toBe('What did Peter want [ GAP_SAME_SUB to leave GAP_INTV_N ] ?')
		expect(is_gap_ambiguous(clause)).toBe(true)
	})
})

describe('checking an ambiguous gap', () => {
	test('the editor warns on the inner verb about a subject reading', () => {
		const warnings = warnings_on({ text: 'John saw the person [that Peter wanted [to leave]].', rules: RULES.CHECKER, stem: 'leave' })

		expect(warnings).toContain("The relativized noun was interpreted as the subject of 'leave', but could also be its object. Other errors and warnings may not be accurate as a result. Specify the sense of 'leave' to help disambiguate.")
	})

	test('the editor does not suggest a sense when one is written', () => {
		const warnings = warnings_on({ text: 'John saw the person [that Peter wanted [to leave-B]].', rules: RULES.CHECKER, stem: 'leave' })

		expect(warnings).toContain("The relativized noun was interpreted as the subject of 'leave', but could also be its object. Other errors and warnings may not be accurate as a result.")
	})

	test('the analyzer warns on the inner verb about an object reading', () => {
		const warnings = warnings_on({ text: 'What did Peter want [to leave]?', rules: ANALYZER_CHECKER_RULES, stem: 'leave' })

		expect(warnings).toContain("The interrogative noun was analyzed as the object of 'leave', but could also be its subject. Check that this was intended.")
	})

	test('a gap that is not ambiguous is not flagged', () => {
		const warnings = warnings_on({ text: 'John did the thing [that Peter wanted [to do]].', rules: RULES.CHECKER, stem: 'do' })

		expect(warnings.filter(warning => warning.includes('could also be its'))).toEqual([])
	})
})
