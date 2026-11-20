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
	went: 'A',
	slept: 'A',
	left: 'A',
	see: 'AB',
	saw: 'AB',
	ate: 'AB',
	say: 'AH',
}

const PARTS_OF_SPEECH: Record<string, PartOfSpeech> = {
	and: 'Conjunction',
	or: 'Conjunction',
	to: 'Adposition',
	in: 'Adposition',
	before: 'Adposition',
	named: 'Verb',
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

// a token that isn't coordinated with anything is tagged no_partner
function is_coordinated(token: Token): boolean {
	return !!token.tag['coordinate'] && token.tag['coordinate'] !== 'no_partner'
}

function coordinates_by_token(tokens: Token[]): Record<string, string> {
	return Object.fromEntries(tokens.filter(token => is_coordinated(token)).map(token => [token.token, token.tag['coordinate']]))
}

function coordinates_by_clause(sentences: Sentence[]): Record<string, string> {
	return Object.fromEntries(sentences[0].clause.sub_tokens
		.filter(token => token.type === TOKEN_TYPE.CLAUSE && is_coordinated(token))
		.map(token => [token.sub_tokens.map(({ token }) => token).join(' '), token.tag['coordinate']]))
}

function list_comma_tags(tokens: Token[]): Array<string | undefined> {
	return tokens.filter(token => token.token === ',').map(token => token.tag['list_comma'])
}

function agents(tokens: Token[]): string[] {
	return tokens.filter(token => token.tag['role'] === 'agent').map(token => token.token)
}

describe('agents with genitives', () => {
	test('a noun after a repeated "of" is not an agent', () => {
		expect(agents(parse_with_lookups('The brother of James and of John go.'))).toEqual(['brother'])
	})

	test('every noun after a repeated "of" in a list is not an agent', () => {
		expect(agents(parse_with_lookups('The brother of James, of John and of Peter go.'))).toEqual(['brother'])
	})

	test("a noun after \"named\" is not an agent: A man named John ate Mary's apple.", () => {
		expect(agents(parse_with_lookups("A man named John ate Mary's apple."))).toEqual(['man'])
	})

	test('a noun without a repeated "of" is a coordinated agent with the noun the genitive belongs to', () => {
		expect(agents(parse_with_lookups('The brother of James and John go.'))).toEqual(['brother', 'John'])
	})

	test('coordinated agents are unchanged without a genitive', () => {
		expect(agents(parse_with_lookups('John and Mary go.'))).toEqual(['John', 'Mary'])
	})

	test('a noun before a genitive is still an agent', () => {
		expect(agents(parse_with_lookups('The brother and sister of John go.'))).toEqual(['brother', 'sister'])
	})
})

describe('nouns with an adposition are coordinated with nouns with the same adposition', () => {
	test('a nested phrase is skipped: John went to the house of James and to the store.', () => {
		const tokens = parse_with_lookups('John went to the house of James and to the store.')

		expect(coordinates_by_token(tokens)).toEqual({ house: 'first', store: 'last' })
	})

	test('the nested nouns are coordinated with each other: John went to the house of James and to the store of Peter.', () => {
		const tokens = parse_with_lookups('John went to the house of James and to the store of Peter.')

		expect(coordinates_by_token(tokens)).toEqual({ house: 'first', store: 'last', James: 'first', Peter: 'last' })
	})

	test('a nested noun is coordinated with the noun after it: John went to the house of James and of Peter.', () => {
		const tokens = parse_with_lookups('John went to the house of James and of Peter.')

		expect(coordinates_by_token(tokens)).toEqual({ James: 'first', Peter: 'last' })
	})

	test('different adpositions are not coordinated: John went to the house of James and in the store.', () => {
		const tokens = parse_with_lookups('John went to the house of James and in the store.')

		expect(coordinates_by_token(tokens)).toEqual({})
	})

	test('a noun is not coordinated across a nested noun with the same adposition: John went to the house of the king of Egypt and of Judah.', () => {
		const tokens = parse_with_lookups('John went to the house of the king of Egypt and of Judah.')

		expect(coordinates_by_token(tokens)).toEqual({ Egypt: 'first', Judah: 'last' })
	})
})

describe('saxon genitives, made_of and title nouns are not coordinated', () => {
	// includes no_partner, so a noun with no entry here has no coordinate tag at all
	const all_coordinate_tags = (tokens: Token[]) => Object.fromEntries(tokens.filter(token => token.tag['coordinate']).map(token => [token.token, token.tag['coordinate']]))

	const has_adposition_tags = (tokens: Token[]) => Object.fromEntries(tokens.filter(token => token.tag['has_adposition']).map(token => [token.token, token.tag['has_adposition']]))

	test("they are tagged as not having an adposition: John went to Mary's house.", () => {
		expect(has_adposition_tags(parse_with_lookups("John went to Mary's house."))).toEqual({ John: 'no', "Mary's": 'no', house: 'yes' })
	})

	test('a made_of noun is tagged as not having an adposition: John saw the gold statue.', () => {
		expect(has_adposition_tags(parse_with_lookups('John saw the gold statue.'))).toEqual({ John: 'no', gold: 'no', statue: 'no' })
	})

	test("the nouns they modify are coordinated: John went to the store and to James's house.", () => {
		expect(all_coordinate_tags(parse_with_lookups("John went to the store and to James's house."))).toEqual({ store: 'first', house: 'last' })
	})

	test("a saxon genitive is skipped when looking for the partner: John saw the store and James's house.", () => {
		expect(all_coordinate_tags(parse_with_lookups("John saw the store and James's house."))).toEqual({ store: 'first', house: 'last' })
	})

	test("nouns with the same adposition are coordinated across saxon genitives: John went to James's house and to Peter's shop.", () => {
		expect(all_coordinate_tags(parse_with_lookups("John went to James's house and to Peter's shop."))).toEqual({ house: 'first', shop: 'last' })
	})

	test('a made_of noun is skipped: John saw the gold statue and the silver idol.', () => {
		expect(all_coordinate_tags(parse_with_lookups('John saw the gold statue and the silver idol.'))).toEqual({ statue: 'first', idol: 'last' })
	})
})

describe('no_partner tags', () => {
	const no_partners = (tokens: Token[]) => tokens.filter(token => token.tag['coordinate'] === 'no_partner').map(token => token.token)

	test('nouns without a coordinator next to them are not tagged: John saw Mary.', () => {
		expect(no_partners(parse_with_lookups('John saw Mary.'))).toEqual([])
	})

	test('nouns that have a partner are not tagged: John went to Jerusalem and to Bethlehem.', () => {
		expect(no_partners(parse_with_lookups('John went to Jerusalem and to Bethlehem.'))).toEqual([])
	})

	test('the noun after a coordinator without a repeated adposition has no partner: John went to Jerusalem and Bethlehem.', () => {
		expect(no_partners(parse_with_lookups('John went to Jerusalem and Bethlehem.'))).toEqual(['Bethlehem'])
	})

	test('the noun after a coordinator with a different adposition has no partner: John went to the house of James and in the store.', () => {
		expect(no_partners(parse_with_lookups('John went to the house of James and in the store.'))).toEqual(['store'])
	})

	test('adjectives, adverbs and clauses are never tagged: John went quickly.', () => {
		expect(no_partners(parse_with_lookups('John went quickly.'))).toEqual([])
	})

	test('coordinated nouns still have all of their positions: John, Mary and Peter went.', () => {
		expect(coordinates_by_token(parse_with_lookups('John, Mary and Peter went.'))).toEqual({ John: 'first', Mary: 'coordinate', Peter: 'last' })
	})

	test('an uncoordinated noun does not become a coordinated agent: John saw Mary.', () => {
		expect(agents(parse_with_lookups('John saw Mary.'))).toEqual(['John'])
	})
})

describe('adposition tags', () => {
	const adpositions_by_token = (tokens: Token[]) => Object.fromEntries(tokens.filter(token => token.tag['adposition']).map(token => [token.token, token.tag['adposition']]))

	test('a noun has the adposition it follows: John went to Jerusalem.', () => {
		expect(adpositions_by_token(parse_with_lookups('John went to Jerusalem.'))).toEqual({ Jerusalem: 'to' })
	})

	test('a noun after a lookup adposition has it: John went in Jerusalem.', () => {
		expect(adpositions_by_token(parse_with_lookups('John went in Jerusalem.'))).toEqual({ Jerusalem: 'in' })
	})

	test('a noun after a function word adposition has it: The brother of James went.', () => {
		expect(adpositions_by_token(parse_with_lookups('The brother of James went.'))).toEqual({ James: 'of' })
	})

	test('each noun has its own adposition: John went to the house of James.', () => {
		expect(adpositions_by_token(parse_with_lookups('John went to the house of James.'))).toEqual({ house: 'to', James: 'of' })
	})

	test('coordinated nouns each have their repeated adposition: John went to Jerusalem and to Bethlehem.', () => {
		expect(adpositions_by_token(parse_with_lookups('John went to Jerusalem and to Bethlehem.'))).toEqual({ Jerusalem: 'to', Bethlehem: 'to' })
	})

	test('a noun without an adposition has no adposition tag: John and Mary went.', () => {
		expect(adpositions_by_token(parse_with_lookups('John and Mary went.'))).toEqual({})
	})

	test("a saxon genitive does not have the adposition, but the noun it modifies does: John went to Mary's house.", () => {
		expect(adpositions_by_token(parse_with_lookups("John went to Mary's house."))).toEqual({ house: 'to' })
	})

	test('the subject of an adverbial clause does not have the clause adposition: Peter slept [before John left].', () => {
		expect(adpositions_by_token(parse_with_lookups('Peter slept [before John left].'))).toEqual({})
	})
})

describe('nouns in an adverbial clause that starts with an adposition', () => {
	const has_adposition_by_token = (tokens: Token[]) => Object.fromEntries(tokens.filter(token => token.tag['has_adposition']).map(token => [token.token, token.tag['has_adposition']]))

	test('the noun does not have an adposition: Peter slept [before John left].', () => {
		const tokens = parse_with_lookups('Peter slept [before John left].')

		expect(has_adposition_by_token(tokens)).toEqual({ Peter: 'no', John: 'no' })
	})

	test('a noun after a plain adposition has one: Peter slept before the war.', () => {
		const tokens = parse_with_lookups('Peter slept before the war.')

		expect(has_adposition_by_token(tokens)).toEqual({ Peter: 'no', war: 'yes' })
	})

	test('coordinated nouns are coordinated with each other: Peter slept [before John and Mary left].', () => {
		const tokens = parse_with_lookups('Peter slept [before John and Mary left].')

		expect(coordinates_by_token(tokens)).toEqual({ John: 'first', Mary: 'last' })
	})

	test('coordinated nouns are both agents of the clause verb: Peter slept [before John and Mary left].', () => {
		const tokens = parse_with_lookups('Peter slept [before John and Mary left].')

		expect(agents(tokens)).toEqual(['Peter', 'John', 'Mary'])
	})
})

describe('list commas', () => {
	test('a comma before an NP with "to" is a list comma', () => {
		const tokens = parse_with_lookups('John went to Jerusalem, to Bethlehem and to Hebron.')

		expect(list_comma_tags(tokens)).toEqual(['np'])
	})

	test('a comma before an NP with another adposition is a list comma', () => {
		const tokens = parse_with_lookups('John went in Jerusalem, in Bethlehem and in Hebron.')

		expect(list_comma_tags(tokens)).toEqual(['np'])
	})

	test('a comma before an NP with "of" is a list comma', () => {
		const tokens = parse_with_lookups('The brother of James, of John and of Peter go.')

		expect(list_comma_tags(tokens)).toEqual(['np'])
	})

	test('a comma before a conjunction and an adposition is a list comma', () => {
		const tokens = parse_with_lookups('John went to Jerusalem, and to Bethlehem.')

		expect(list_comma_tags(tokens)).toEqual(['np'])
	})

	test('a comma between nouns is a list comma without any adposition', () => {
		const tokens = parse_with_lookups('John went to Jerusalem, Bethlehem and Hebron.')

		expect(list_comma_tags(tokens)).toEqual(['np'])
	})

	test('every comma in a list of nouns is a list comma', () => {
		const tokens = parse_with_lookups('John, Mary, Peter and Andrew go.')

		expect(list_comma_tags(tokens)).toEqual(['np', 'np'])
	})

	test('addressee commas are not list commas', () => {
		const tokens = parse_with_lookups('John, the brother of Peter, go.')

		expect(list_comma_tags(tokens)).toEqual([undefined, undefined])
	})

	test('a comma before an infinitive "to" is not a list comma', () => {
		const tokens = parse_with_lookups('John saw Mary, to go.')

		expect(list_comma_tags(tokens)).toEqual([undefined])
	})
})

describe('coordinate tags', () => {
	test('two coordinated nouns are first and last', () => {
		const tokens = parse_with_lookups('John and Mary go.')

		expect(coordinates_by_token(tokens)).toEqual({ John: 'first', Mary: 'last' })
	})

	test('nouns in the middle of a list are coordinate', () => {
		const tokens = parse_with_lookups('John see Mary, Peter, James and Andrew.')

		expect(coordinates_by_token(tokens)).toEqual({ Mary: 'first', Peter: 'coordinate', James: 'coordinate', Andrew: 'last' })
	})

	test('without a repeated "of", the noun is coordinated with the noun the "of" phrase belongs to', () => {
		const tokens = parse_with_lookups('The brother of James and John go.')

		expect(coordinates_by_token(tokens)).toEqual({ brother: 'first', John: 'last' })
	})

	test('an optional "of" before the second noun gives the same coordination', () => {
		const tokens = parse_with_lookups('The brother of James and of John go.')

		expect(coordinates_by_token(tokens)).toEqual({ James: 'first', John: 'last' })
	})

	test('nouns with an adposition before each of them are coordinated', () => {
		const tokens = parse_with_lookups('John went to Jerusalem and to Bethlehem.')

		expect(coordinates_by_token(tokens)).toEqual({ Jerusalem: 'first', Bethlehem: 'last' })
	})

	test('without a repeated adposition, the noun is not coordinated with the noun after the adposition', () => {
		const tokens = parse_with_lookups('John went to Jerusalem and Bethlehem.')

		expect(coordinates_by_token(tokens)).toEqual({})
	})

	test('nouns with "of" before each of them are coordinated', () => {
		const tokens = parse_with_lookups('The brother of James, of John and of Peter go.')

		expect(coordinates_by_token(tokens)).toEqual({ James: 'first', John: 'coordinate', Peter: 'last' })
	})

	test('nouns with modifiers are coordinated at the same level', () => {
		const tokens = parse_with_lookups('The brother of the big man and of the old woman go.')

		expect(coordinates_by_token(tokens)).toEqual({ man: 'first', woman: 'last' })
	})

	test('nouns in front of "of" are coordinated, but not with the noun after it', () => {
		const tokens = parse_with_lookups('The brother and sister of John go.')

		expect(coordinates_by_token(tokens)).toEqual({ brother: 'first', sister: 'last' })
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
