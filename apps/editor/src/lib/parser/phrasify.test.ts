import { describe, expect, test } from 'vitest'
import { phrasify } from './phrasify'
import { clausify, flatten_sentences } from './clausify'
import { apply_transform_and_sense_rules } from './index'
import { tokenize_input } from './tokenize'
import { RULES, apply_rules } from '#lib/rules/index.js'
import { TOKEN_TYPE, create_token, create_lookup_result } from '#lib/token.js'
import type { PartOfSpeech } from '@tabitha/types'
import type { Token } from '#lib/types.js'

describe('phrasify', () => {
	test('handles empty sentence array', () => {
		const result = phrasify([])
		expect(result).toEqual([])
	})

	test('wraps Noun token in NP phrase tokens', () => {
		const noun_token = create_token({ token: 'Daniel', type: TOKEN_TYPE.LOOKUP_WORD, lookup_results: [create_lookup_result({ stem: 'Daniel', part_of_speech: 'Noun', sense: 'A' })] })
		const main_clause = create_token({ token: '{', type: TOKEN_TYPE.CLAUSE, sub_tokens: [noun_token] })

		const result = phrasify([{ clause: main_clause }])
		const tokens = flatten_sentences(result)

		expect(tokens.length).toBe(3)
		expect(tokens[0].token).toBe('{NP')
		expect(tokens[1].token).toBe('Daniel')
		expect(tokens[2].token).toBe('}')
	})

	test('wraps Verb token in VP phrase tokens', () => {
		const verb_token = create_token({ token: 'prayed', type: TOKEN_TYPE.LOOKUP_WORD, lookup_results: [create_lookup_result({ stem: 'pray', part_of_speech: 'Verb', sense: 'A' })] })
		const main_clause = create_token({ token: '{', type: TOKEN_TYPE.CLAUSE, sub_tokens: [verb_token] })

		const result = phrasify([{ clause: main_clause }])
		const tokens = flatten_sentences(result)

		expect(tokens.length).toBe(3)
		expect(tokens[0].token).toBe('{VP')
		expect(tokens[1].token).toBe('prayed')
		expect(tokens[2].token).toBe('}')
	})

	describe('coordinate NPs', () => {
		const noun = (stem: string) => create_token({ token: stem, type: TOKEN_TYPE.LOOKUP_WORD, lookup_results: [create_lookup_result({ stem, part_of_speech: 'Noun', sense: 'A' })] })
		const coordinate_noun = (coordinate: string) => (stem: string) => ({ ...noun(stem), tag: { coordinate } })
		const first_noun = coordinate_noun('first')
		const middle_noun = coordinate_noun('coordinate')
		const last_noun = coordinate_noun('last')
		const to_word = () => create_token({ token: 'to', type: TOKEN_TYPE.FUNCTION_WORD, tag: { pre_np_adposition: 'verb_argument' } })
		const of_word =() => create_token({ token: 'of', type: TOKEN_TYPE.FUNCTION_WORD, tag: { relation: 'genitive_norman', pre_np_adposition: 'relation' } })
		const and_word = () => create_token({ token: 'and', type: TOKEN_TYPE.FUNCTION_WORD, tag: { syntax: 'coord_noun' } })
		const comma = () => create_token({ token: ',', type: TOKEN_TYPE.PUNCTUATION, tag: { syntax: 'comma' } })
		const list_comma = () => create_token({ token: ',', type: TOKEN_TYPE.PUNCTUATION, tag: { syntax: 'comma', list_comma: 'np' } })
		const phrasified_text = (sub_tokens: Token[]) => flatten_sentences(phrasify([{ clause: create_token({ token: '{', type: TOKEN_TYPE.CLAUSE, sub_tokens }) }]))
			.map(token => token.token)
			.join(' ')

		test('a genitive NP does not absorb the coordinate genitive NP after it', () => {
			const tokens = [noun('brother'), of_word(), first_noun('James'), and_word(), of_word(), last_noun('John')]

			expect(phrasified_text(tokens)).toBe('{NP brother {NP of James } {NP and of John } }')
		})

		test('coordinate NPs with an adposition each stay separate NPs', () => {
			const tokens = [to_word(), first_noun('Jerusalem'), and_word(), to_word(), last_noun('Bethlehem')]

			expect(phrasified_text(tokens)).toBe('{NP to Jerusalem } {NP and to Bethlehem }')
		})

		test('a list comma ends the NP before it', () => {
			const tokens = [noun('brother'), of_word(), first_noun('James'), list_comma(), of_word(), middle_noun('John'), and_word(), of_word(), last_noun('Peter')]

			expect(phrasified_text(tokens)).toBe('{NP brother {NP of James , } {NP of John } {NP and of Peter } }')
		})

		test('a list comma before an NP with any adposition ends the NP before it', () => {
			const tokens = [to_word(), first_noun('Jerusalem'), list_comma(), to_word(), middle_noun('Bethlehem'), and_word(), to_word(), last_noun('Hebron')]

			expect(phrasified_text(tokens)).toBe('{NP to Jerusalem , } {NP to Bethlehem } {NP and to Hebron }')
		})

		test('a list comma before a conjunction ends the NP before it', () => {
			const tokens = [noun('brother'), of_word(), first_noun('James'), list_comma(), and_word(), of_word(), last_noun('John')]

			expect(phrasified_text(tokens)).toBe('{NP brother {NP of James , } {NP and of John } }')
		})

		test('a comma that is not a list comma stays outside the NPs', () => {
			expect(phrasified_text([noun('John'), comma(), noun('Mary')])).toBe('{NP John } , {NP Mary }')
		})

		test('coordinate NPs without a genitive stay separate NPs', () => {
			expect(phrasified_text([first_noun('John'), and_word(), last_noun('Mary')])).toBe('{NP John } {NP and Mary }')
		})
	})

	describe('coordinate NPs in parsed text', () => {
		const parts_of_speech: Record<string, PartOfSpeech> = { and: 'Conjunction', go: 'Verb', went: 'Verb', to: 'Adposition', big: 'Adjective', three: 'Adjective' }

		// stand-in for the ontology lookup
		const phrasified_text = (text: string): string => {
			return phrasified_tokens(text).map(token => token.token).join(' ')
		}

		const phrasified_tokens = (text: string): Token[] => {
			let sentences = clausify(tokenize_input(text))
			sentences = apply_rules({ sentences, rules: RULES.SYNTAX })
			sentences = apply_rules({ sentences, rules: RULES.LOOKUP })
			for (const token of flatten_sentences(sentences).filter(token => token.type === TOKEN_TYPE.LOOKUP_WORD)) {
				const stem = token.token.toLowerCase()
				const part_of_speech = parts_of_speech[stem] ?? 'Noun'
				token.lookup_results = [create_lookup_result({ stem, part_of_speech, categorization: part_of_speech === 'Verb' ? 'A' : '', ontology_status: 'in ontology' })]
			}
			sentences = apply_transform_and_sense_rules(apply_rules({ sentences, rules: RULES.PART_OF_SPEECH }))
			return flatten_sentences(phrasify(sentences))
		}
		const phrasified_with_relations = (text: string): string => phrasified_tokens(text)
			.map(token => token.token + (token.tag.relation ? `<${token.tag.relation}>` : ''))
			.join(' ')

		test('keeps genitive NPs joined by a conjunction as siblings', () => {
			expect(phrasified_text('The brother of James and of John go.')).toBe('{NP The brother {NP of James } {NP and of John } } {VP go } .')
		})

		test('an NP without a repeated "of" is coordinated with the NP the genitive belongs to, so it stays outside', () => {
			expect(phrasified_text('The brother of James and John go.')).toBe('{NP The brother {NP of James } } {NP and John } {VP go } .')
		})

		test('an optional adposition before the second NP gives the same structure', () => {
			expect(phrasified_text('John went to Jerusalem and Bethlehem.')).toBe('{NP John } {VP went } {NP to Jerusalem } {NP and Bethlehem } .')
		})

		test('a comma before a genitive NP ends the NP before it', () => {
			expect(phrasified_text('The brother of James, of John and of Peter go.')).toBe('{NP The brother {NP of James , } {NP of John } {NP and of Peter } } {VP go } .')
		})

		test('a comma and conjunction before a genitive NP', () => {
			expect(phrasified_text('The brother of James, of John, and of Peter go.')).toBe('{NP The brother {NP of James , } {NP of John , } {NP and of Peter } } {VP go } .')
		})

		test('a comma between coordinate agents ends the NP before it', () => {
			expect(phrasified_text('John, Mary and Peter go.')).toBe('{NP John , } {NP Mary } {NP and Peter } {VP go } .')
		})

		test('a comma after a genitive NP ends the NP before it', () => {
			expect(phrasified_text('The brother of James, John and Peter go.')).toBe('{NP The brother {NP of James , } } {NP John } {NP and Peter } {VP go } .')
		})

		test('a pre_head_adjunct NP (made_of) stays in front of the head noun, after the determiner', () => {
			expect(phrasified_with_relations('A gold statue go.')).toBe('{NP A {NP<made_of|pre_head_adjunct> gold<made_of|pre_head_adjunct> } statue } {VP go } .')
		})

		test('a pre_head_adjunct NP (title) is wrapped around the title word', () => {
			expect(phrasified_with_relations('King David go.')).toBe('{NP {NP<title|pre_head_adjunct> King<title|pre_head_adjunct> } David } {VP go } .')
		})

		test('an attributive adjective stays outside a following pre_head_adjunct NP', () => {
			expect(phrasified_with_relations('The big gold statue go.')).toBe('{NP The {AdjP big } {NP<made_of|pre_head_adjunct> gold<made_of|pre_head_adjunct> } statue } {VP go } .')
		})

		test.each([
			['group', 'A group of people go.'],
			['kind', 'A kind of tree go.'],
			['quantity', 'A jar of water go.'],
		])('a %s "of" phrase is a pre_head_of NP in front of the noun that follows', (relation, text) => {
			const [, ...rest] = text.split(' ')
			const noun = rest[rest.length - 2]
			expect(phrasified_with_relations(text)).toContain(`{NP<${relation}|pre_head_of>`)
			expect(phrasified_with_relations(text)).toContain(`} ${noun} }`)
		})

		test('an adjective before a pre_head_of word stays inside the pre_head_of NP', () => {
			expect(phrasified_with_relations('A big jar of water go.')).toBe('{NP {NP<quantity|pre_head_of> A {AdjP big } jar of<quantity|pre_head_of> } water } {VP go } .')
		})

		test('a multiplication NP stays in front of the NP it multiplies', () => {
			expect(phrasified_with_relations('Three times-B the amount go.')).toBe('{NP {NP<multiplication> {AdjP Three } times-B<multiplication> } the amount } {VP go } .')
		})

		test('an iteration "times" is its own NP after the verb phrase', () => {
			expect(phrasified_with_relations('John went to Jerusalem three times.')).toBe('{NP John } {VP went } {NP to Jerusalem } {NP<iteration> {AdjP three } times<iteration> } .')
		})
	})

	test('recursively processes nested subordinate clauses', () => {
		const noun_token = create_token({ token: 'God', type: TOKEN_TYPE.LOOKUP_WORD, lookup_results: [create_lookup_result({ stem: 'God', part_of_speech: 'Noun', sense: 'A' })] })
		const sub_clause = create_token({ token: '[', type: TOKEN_TYPE.CLAUSE, sub_tokens: [noun_token] })
		const main_clause = create_token({ token: '{', type: TOKEN_TYPE.CLAUSE, sub_tokens: [sub_clause] })

		const result = phrasify([{ clause: main_clause }])
		const tokens = flatten_sentences(result)

		expect(tokens.some(t => t.token === '{NP')).toBe(true)
		expect(tokens.some(t => t.token === 'God')).toBe(true)
	})
})
