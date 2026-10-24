import { apply_transform_and_sense_rules } from '#lib/parser/index.js'
import { clausify, flatten_sentences } from '#lib/parser/clausify.js'
import { tokenize_input } from '#lib/parser/tokenize.js'
import { RULES, apply_rules } from '#lib/rules/index.js'
import { TOKEN_TYPE, create_clause_token, create_lookup_result } from '#lib/token.js'
import { find_alternate_coordinate_position } from '#lib/rules/coordination.js'
import { describe, expect, test } from 'vitest'
import type { PartOfSpeech } from '@tabitha/types'
import type { Sentence, Token } from '#lib/types.js'

const VERB_CATEGORIZATIONS: Record<string, string> = {
	go: 'A',
	see: 'AB',
	say: 'AH',
}

const PARTS_OF_SPEECH: Record<string, PartOfSpeech> = {
	and: 'Conjunction',
	or: 'Conjunction',
	big: 'Adjective',
	red: 'Adjective',
	old: 'Adjective',
	quickly: 'Adverb',
	quietly: 'Adverb',
}

// stand-in for the ontology lookup
function parse_with_lookups(text: string): Token[] {
	return flatten_sentences(parse_sentences_with_lookups(text))
}

function parse_sentences_with_lookups(text: string): Sentence[] {
	let sentences = clausify(tokenize_input(text))
	sentences = apply_rules({ sentences, rules: RULES.SYNTAX })
	sentences = apply_rules({ sentences, rules: RULES.LOOKUP })
	for (const token of flatten_sentences(sentences).filter(token => token.type === TOKEN_TYPE.LOOKUP_WORD)) {
		const stem = token.token.toLowerCase()
		const categorization = VERB_CATEGORIZATIONS[stem]
		const part_of_speech = categorization ? 'Verb' : PARTS_OF_SPEECH[stem] ?? 'Noun'
		token.lookup_results = [create_lookup_result({ stem, part_of_speech, categorization: categorization ?? '', ontology_status: 'in ontology' })]
	}
	return apply_transform_and_sense_rules(apply_rules({ sentences, rules: RULES.PART_OF_SPEECH }))
}

function coordinates_by_token(tokens: Token[]): Record<string, string> {
	return Object.fromEntries(tokens.filter(token => token.tag['coordinate']).map(token => [token.token, token.tag['coordinate']]))
}

function coordinates_by_clause(sentences: Sentence[]): Record<string, string> {
	return Object.fromEntries(sentences[0].clause.sub_tokens
		.filter(token => token.type === TOKEN_TYPE.CLAUSE && token.tag['coordinate'])
		.map(token => [token.sub_tokens.map(({ token }) => token).join(' '), token.tag['coordinate']]))
}

describe('coordinate tags', () => {
	test('two coordinated nouns are first and last', () => {
		const tokens = parse_with_lookups('John and Mary go.')

		expect(coordinates_by_token(tokens)).toEqual({ John: 'first', Mary: 'last' })
	})

	test('nouns in the middle of a list are coordinate', () => {
		const tokens = parse_with_lookups('John see Mary, Peter, James and Andrew.')

		expect(coordinates_by_token(tokens)).toEqual({ Mary: 'first', Peter: 'coordinate', James: 'coordinate', Andrew: 'last' })
	})

	test('an addressee is not coordinated', () => {
		const tokens = parse_with_lookups('John, Mary go.')

		expect(coordinates_by_token(tokens)).toEqual({})
	})

	test('coordinated adjectives', () => {
		const tokens = parse_with_lookups('John see the big, red and old dog.')

		expect(coordinates_by_token(tokens)).toEqual({ big: 'first', red: 'coordinate', old: 'last' })
	})

	test('coordinated adverbs', () => {
		const tokens = parse_with_lookups('John go quickly and quietly.')

		expect(coordinates_by_token(tokens)).toEqual({ quickly: 'first', quietly: 'last' })
	})

	test('coordinated clauses', () => {
		const sentences = parse_sentences_with_lookups('John say [that Mary go], [Peter go] [or James go].')

		expect(coordinates_by_clause(sentences)).toEqual({ '[ that Mary go ]': 'first', '[ Peter go ]': 'coordinate', '[ or James go ]': 'last' })
	})

	test('adjacent clauses of the same type without a comma or and/or are still coordinated', () => {
		const sentences = parse_sentences_with_lookups('John say [that Mary go] [Peter go] [and James go].')

		expect(coordinates_by_clause(sentences)).toEqual({ '[ that Mary go ]': 'first', '[ Peter go ]': 'coordinate', '[ and James go ]': 'last' })
	})

	test('_addressee marks an addressee before a coordinated agent', () => {
		const tokens = parse_with_lookups('John _addressee, Mary and Peter go.')

		expect(coordinates_by_token(tokens)).toEqual({ Mary: 'first', Peter: 'last' })
	})
})

describe('find_alternate_coordinate_position', () => {
	// null is a clause that isn't a vocabulary alternate
	function create_clauses(alternates: (string | null)[]): Token[] {
		return alternates.map(alternate => create_clause_token({
			sub_tokens: [],
			tag: alternate ? { 'clause_type': 'main_clause', 'vocabulary_alternate': alternate } : { 'clause_type': 'main_clause' },
		}))
	}

	// mirrors the transform rule, which tags each clause in order so the previous clause already has its position
	function find_positions(alternates: (string | null)[]): (string | null)[] {
		const tokens = create_clauses(alternates)
		return tokens.map((token, index) => {
			const alternate = token.tag['vocabulary_alternate']
			if (!alternate) return null

			const position = find_alternate_coordinate_position({ tokens, index })
			token.tag['vocabulary_alternate'] = `${alternate}|${position}`
			return position
		})
	}

	test.each([
		{ alternates: ['complex'], expected: ['single'] },
		{ alternates: ['simple'], expected: ['single'] },
		{ alternates: ['complex', 'simple'], expected: ['single', 'single'] },
		{ alternates: ['simple', 'complex'], expected: ['single', 'single'] },
		{ alternates: ['complex', 'complex'], expected: ['first', 'last'] },
		{ alternates: ['simple', 'simple'], expected: ['first', 'last'] },
		{ alternates: ['complex', 'complex', 'complex'], expected: ['first', 'coordinate', 'last'] },
		{ alternates: ['simple', 'simple', 'simple'], expected: ['first', 'coordinate', 'last'] },
		{ alternates: ['complex', 'complex', 'simple', 'simple'], expected: ['first', 'last', 'first', 'last'] },
		{ alternates: ['complex', 'simple', 'simple', 'simple'], expected: ['single', 'first', 'coordinate', 'last'] },
		{ alternates: ['simple', 'complex', 'simple'], expected: ['single', 'single', 'single'] },
	])('$alternates -> $expected', ({ alternates, expected }) => {
		expect(find_positions(alternates)).toEqual(expected)
	})

	test('a clause that is not an alternate breaks the sequence', () => {
		expect(find_positions(['complex', null, 'complex'])).toEqual(['single', null, 'single'])
	})
})
