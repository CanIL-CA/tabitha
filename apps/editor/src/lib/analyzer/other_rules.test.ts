import { describe, expect, test } from 'vitest'
import { assign_noun_list_indexes, move_format_markers_out_of_clauses, replace_or_insert_noun_relations, replace_punctuation } from './other_rules'
import { phrase } from './test_helps'
import { TOKEN_TYPE, create_lookup_result, create_token } from '#lib/token.js'
import type { EditorAnalyzedEntity } from '@tabitha/types'
import type { Sentence, Token } from '#lib/types.js'

describe('other_rules', () => {
	test('assign_noun_list_indexes gives each distinct noun its own index', () => {
		const entity1: EditorAnalyzedEntity = {
			category: 'Noun',
			value: 'Paul',
			features: [],
			concept: { stem: 'Paul', sense: 'A', part_of_speech: 'Noun' },
			pairing_concept: null,
			pairing_type: null,
			noun_list_index: '1',
		}
		const entity2: EditorAnalyzedEntity = {
			category: 'Noun',
			value: 'letter',
			features: [],
			concept: { stem: 'letter', sense: 'A', part_of_speech: 'Noun' },
			pairing_concept: null,
			pairing_type: null,
			noun_list_index: '2',
		}

		assign_noun_list_indexes([entity1, entity2])
		expect(entity1.noun_list_index).toBe('1')
		expect(entity2.noun_list_index).toBe('2')
	})

	test('assign_noun_list_indexes reuses the index of a repeated noun', () => {
		const make_paul = (): EditorAnalyzedEntity => ({
			category: 'Noun',
			value: 'Paul',
			features: [],
			concept: { stem: 'Paul', sense: 'A', part_of_speech: 'Noun' },
			pairing_concept: null,
			pairing_type: null,
			noun_list_index: null,
		})
		const [first, second] = [make_paul(), make_paul()]

		assign_noun_list_indexes([first, second])
		expect([first.noun_list_index, second.noun_list_index]).toEqual(['1', '1'])
	})

	describe('move_format_markers_out_of_clauses', () => {
		const entity = ({ category, value }: Pick<EditorAnalyzedEntity, 'category' | 'value'>): EditorAnalyzedEntity => ({
			category,
			value,
			features: [],
			concept: null,
			pairing_concept: null,
			pairing_type: null,
			noun_list_index: null,
		})
		const values = (entities: EditorAnalyzedEntity[]) => entities.map(({ value }) => value)
		const paragraph = () => entity({ category: 'Format Marker', value: 'Paragraph' })
		const poetry_begin = () => entity({ category: 'Format Marker', value: 'Poetry Begin' })
		const poetry_end = () => entity({ category: 'Format Marker', value: 'Poetry End' })
		const word = (value: string) => entity({ category: 'Noun', value })

		test('moves paragraph and poetry-begin before the sentence', () => {
			const entities = [
				entity({ category: 'Clause', value: '{' }), word('a'), entity({ category: 'Clause', value: '[' }), paragraph(), poetry_begin(), word('b'), entity({ category: '', value: ']' }),
				entity({ category: 'period', value: '.' }), entity({ category: '', value: '}' }),
			]
			expect(values(move_format_markers_out_of_clauses(entities))).toEqual([
				'Paragraph', 'Poetry Begin', '{', 'a', '[', 'b', ']', '.', '}',
			])
		})

		test('moves poetry-end before the sentence when more follows it', () => {
			const entities = [
				entity({ category: 'Clause', value: '{' }), word('a'), poetry_end(), word('b'), entity({ category: 'period', value: '.' }), entity({ category: '', value: '}' }),
			]
			expect(values(move_format_markers_out_of_clauses(entities))).toEqual(['Poetry End', '{', 'a', 'b', '.', '}'])
		})

		test('moves a poetry-end at the end of the sentence to the end of the sentence, past particles', () => {
			const entities = [
				entity({ category: 'Clause', value: '{' }), word('a'), word('b'), poetry_end(),
				entity({ category: 'Particle', value: 'exclamation' }), entity({ category: 'period', value: '.' }), entity({ category: '', value: '}' }),
			]
			expect(values(move_format_markers_out_of_clauses(entities))).toEqual(['{', 'a', 'b', 'exclamation', '.', '}', 'Poetry End'])
		})

		test('leaves markers outside any sentence alone', () => {
			const entities = [paragraph(), entity({ category: 'Clause', value: '{' }), word('a'), entity({ category: 'period', value: '.' }), entity({ category: '', value: '}' })]
			expect(values(move_format_markers_out_of_clauses(entities))).toEqual(['Paragraph', '{', 'a', '.', '}'])
		})
	})

	test('replace_punctuation replaces sentence terminal punctuation', () => {
		const token_punct = create_token({ token: '!', type: TOKEN_TYPE.PUNCTUATION })
		const main_clause = create_token({ token: '{', type: TOKEN_TYPE.CLAUSE, sub_tokens: [token_punct], tag: { clause_type: 'main_clause' } })

		const sentences: Sentence[] = [{ clause: main_clause }]
		const result = replace_punctuation(sentences)
		expect(result.length).toBe(1)
	})

	describe('replace_or_insert_noun_relations', () => {
		const relation_word = ({ token, relation }: { token: string; relation: string }) => create_token({ token, type: TOKEN_TYPE.FUNCTION_WORD, tag: { relation, pre_np_adposition: 'relation' } })
		const noun_word = (stem: string) => create_token({
			token: stem,
			type: TOKEN_TYPE.LOOKUP_WORD,
			lookup_results: [create_lookup_result({ stem, part_of_speech: 'Noun', sense: 'A' })],
		})
		const relate = (sub_tokens: Token[]) => replace_or_insert_noun_relations([{
			clause: create_token({ token: '{', type: TOKEN_TYPE.CLAUSE, sub_tokens, tag: { clause_type: 'main_clause' } }),
		}])[0].clause.sub_tokens
		const stems = (tokens: Token[]) => tokens.map(token => token.lookup_results[0]?.stem ?? token.token)

		test('replaces "of" after a quantity noun with -Quantity', () => {
			const tokens = relate([noun_word('jar'), relation_word({ token: 'of', relation: 'quantity' }), noun_word('water')])

			expect(stems(tokens)).toEqual(['jar', '-Quantity', 'water'])
			expect(tokens[1].type).toBe(TOKEN_TYPE.LOOKUP_WORD)
			expect(tokens[1].lookup_results[0].part_of_speech).toBe('Adposition')
		})

		test('inserts -Iteration before the noun for the iteration relation, keeping the original token', () => {
			const tokens = relate([relation_word({ token: 'times', relation: 'iteration' }), noun_word('week')])

			expect(stems(tokens)).toEqual(['-Iteration', 'times', 'week'])
			expect(tokens[0].tag).toEqual({ relation: 'iteration', pre_np_adposition: 'relation' })
		})

		test.each([
			['name', '-Name', 'replace'],
			['subgroup', '-Subgroup', 'replace'],
			['group', '-Group', 'replace'],
			['kind', '-Kind of', 'replace'],
			['title', '-Title', 'insert'],
			['made_of', '-Made of', 'insert'],
		])('the %s relation uses %s (%s)', (relation, relation_stem, action) => {
			const original = relation_word({ token: 'of', relation })
			const tokens = relate([noun_word('thing'), original])

			expect(tokens.length).toBe(action === 'replace' ? 2 : 3)
			expect(stems(tokens)).toContain(relation_stem)
			expect(tokens.includes(original)).toBe(action === 'insert')
		})

		test('leaves tokens without a relation alone', () => {
			const tokens = relate([noun_word('jar'), noun_word('water')])

			expect(stems(tokens)).toEqual(['jar', 'water'])
		})

		describe('generic genitive', () => {
			const modifier_np = ({ relation, modifier }: { relation: 'genitive_norman' | 'genitive_saxon'; modifier: string }) => phrase({
				type: 'NP',
				tag: { relation },
				contents: relation === 'genitive_norman'
					? [relation_word({ token: 'of', relation }), noun_word(modifier)]
					: [{ ...noun_word(modifier), tag: { relation } }],
			})
			// eg {NP brother {NP<genitive_norman> of James } } or {NP {NP<genitive_saxon> James's } brother }
			const genitive_stems = ({ relation, head, modifier }: { relation: 'genitive_norman' | 'genitive_saxon'; head: string; modifier: string }) => {
				const contents = relation === 'genitive_norman'
					? [noun_word(head), ...modifier_np({ relation, modifier })]
					: [...modifier_np({ relation, modifier }), noun_word(head)]
				const tokens = relate(phrase({ type: 'NP', contents }))
				return stems(tokens)
			}

			test('a norman genitive replaces "of" with the relation', () => {
				expect(genitive_stems({ relation: 'genitive_norman', head: 'brother', modifier: 'James' })).toEqual(['{NP', 'brother', '{NP', '-Kinship', 'James', '}', '}'])
			})

			test('a saxon genitive inserts the relation before the possessive word', () => {
				expect(genitive_stems({ relation: 'genitive_saxon', head: 'brother', modifier: 'James' })).toEqual(['{NP', '{NP', '-Kinship', 'James', '}', 'brother', '}'])
			})

			test.each([
				['hand', '-Body Part'],
				['brother', '-Kinship'],
				['house', '-Owner'],
				['top', '-Part Whole'],
				['meter', '-Quantity-Distance'],
				['thing', '-Owner'],
			])('uses the contextual relation for the head noun %s', (head, relation_stem) => {
				expect(genitive_stems({ relation: 'genitive_norman', head, modifier: 'James' })).toContain(relation_stem)
			})

			test('falls back to -Generic Genitive when the head noun has no contextual relation', () => {
				expect(genitive_stems({ relation: 'genitive_norman', head: 'idea', modifier: 'James' })).toContain('-Generic Genitive')
				expect(genitive_stems({ relation: 'genitive_saxon', head: 'idea', modifier: 'James' })).toContain('-Generic Genitive')
			})

			test('uses the generic genitive when the relation word is not inside a nested NP', () => {
				const tokens = relate([relation_word({ token: 'of', relation: 'genitive_norman' })])

				expect(stems(tokens)).toEqual(['-Generic Genitive'])
			})
		})
	})
})
