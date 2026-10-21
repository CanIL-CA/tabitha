import { describe, expect, test } from 'vitest'
import { analyze } from './index'
import { entityfy } from './entityfy'
import { get_features_for_token } from './features'
import { order_entities } from './ordering'
import { populate_noun_list, replace_punctuation } from './other_rules'
import { TOKEN_TYPE, create_token, create_lookup_result } from '#lib/token.js'
import type { EditorAnalyzedEntity } from '@tabitha/types'
import type { Sentence } from '#lib/types.js'

describe('analyzer', () => {
	describe('analyze pipeline', () => {
		test('handles empty sentence list', () => {
			const result = analyze([])
			expect(result.source_entities).toEqual([])
			expect(result.noun_list).toEqual([])
			expect(result.notes).toEqual([])
		})

		test('analyzes sentence with lookup tokens', () => {
			const noun_token = create_token({
				token: 'Paul',
				type: TOKEN_TYPE.LOOKUP_WORD,
				lookup_results: [create_lookup_result({ stem: 'Paul', part_of_speech: 'Noun', sense: 'A' })],
				tag: { noun_index: '1' },
			})
			const main_clause = create_token({ token: '{', type: TOKEN_TYPE.CLAUSE, sub_tokens: [noun_token], tag: { clause_type: 'main_clause' } })

			const sentence: Sentence = {
				clause: main_clause,
			}

			const result = analyze([sentence])
			expect(result.source_entities.length).toBeGreaterThan(0)
			expect(Array.isArray(result.noun_list)).toBe(true)
			expect(Array.isArray(result.notes)).toBe(true)
		})
	})

	describe('entityfy', () => {
		test('converts main clause structure with delimiters', () => {
			const token_noun = create_token({
				token: 'Paul',
				type: TOKEN_TYPE.LOOKUP_WORD,
				lookup_results: [create_lookup_result({ stem: 'Paul', part_of_speech: 'Noun', sense: 'A' })],
				tag: { noun_index: '1' },
			})

			const main_clause = create_token({ token: '{', type: TOKEN_TYPE.CLAUSE, sub_tokens: [token_noun], tag: { clause_type: 'main_clause' } })

			const entities = entityfy([{ clause: main_clause }])
			expect(entities[0].category).toBe('Clause')
			expect(entities[0].value).toBe('{')
			expect(entities[entities.length - 1].value).toBe('}')
		})

		test('preserves an explicit noun_list_index rather than collapsing it to 1', () => {
			const token_noun = create_token({
				token: 'letter',
				type: TOKEN_TYPE.LOOKUP_WORD,
				lookup_results: [create_lookup_result({ stem: 'letter', part_of_speech: 'Noun', sense: 'A' })],
				tag: { noun_index: '3' },
			})

			const entities = entityfy([{ clause: token_noun }])
			expect(entities[0].noun_list_index).toBe('3')
		})

		test('handles subordinate clauses with bracket notation', () => {
			const sub_clause = create_token({ token: '[', type: TOKEN_TYPE.CLAUSE, sub_tokens: [], tag: { clause_type: 'subordinate_clause' } })

			const entities = entityfy([{ clause: sub_clause }])
			expect(entities[0].value).toBe('[')
			expect(entities[entities.length - 1].value).toBe(']')
		})
	})

	describe('other_rules', () => {
		test('populate_noun_list extracts unique nouns and formats noun identifier', () => {
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

			const noun_list = populate_noun_list([entity1, entity2])
			expect(noun_list.length).toBe(2)
			expect(noun_list[0].noun).toBe('Paul-A')
			expect(noun_list[1].noun).toBe('letter-A')
		})

		test('replace_punctuation replaces sentence terminal punctuation', () => {
			const token_punct = create_token({ token: '!', type: TOKEN_TYPE.PUNCTUATION })
			const main_clause = create_token({ token: '{', type: TOKEN_TYPE.CLAUSE, sub_tokens: [token_punct], tag: { clause_type: 'main_clause' } })

			const sentences: Sentence[] = [{ clause: main_clause }]
			const result = replace_punctuation(sentences)
			expect(result.length).toBe(1)
		})
	})

	describe('ordering', () => {
		const entity = (overrides: Partial<EditorAnalyzedEntity>): EditorAnalyzedEntity => ({
			category: '',
			value: '',
			features: [],
			concept: null,
			pairing_concept: null,
			pairing_type: null,
			noun_list_index: null,
			...overrides,
		})
		const concept = ({ stem, part_of_speech }: { stem: string; part_of_speech: 'Noun' | 'Verb' }) => entity({ category: part_of_speech, value: stem, concept: { stem, sense: 'A', part_of_speech } })
		const close = (value: string) => entity({ value })
		const np = ({ stem, role }: { stem: string; role: string }) => [
			entity({ category: 'Noun Phrase', value: '(', features: [{ name: 'Semantic Role', value: role }] }),
			concept({ stem, part_of_speech: 'Noun' }),
			close(')'),
		]
		const vp = (stem: string) => [entity({ category: 'Verb Phrase', value: '(' }), concept({ stem, part_of_speech: 'Verb' }), close(')')]
		const clause = ({ type, children }: { type: string; children: EditorAnalyzedEntity[] }) => [
			entity({ category: 'Clause', value: '[', features: [{ name: 'Type', value: type }] }),
			...children,
			close(']'),
		]
		const main_clause = (children: EditorAnalyzedEntity[]) => [
			entity({ category: 'Clause', value: '{', features: [{ name: 'Type', value: 'Independent' }] }),
			...children,
			entity({ category: 'period', value: '.' }),
			close('}'),
		]
		const stems = (entities: EditorAnalyzedEntity[]) => entities.filter(e => e.concept).map(e => e.value)

		test('places the agent NP before the verb and the patient NP directly after it', () => {
			const entities = main_clause([
				...np({ stem: 'letter', role: 'Most Patient-like' }),
				...vp('write'),
				...np({ stem: 'Paul', role: 'Most Agent-like' }),
				...np({ stem: 'Corinth', role: 'Destination' }),
			])

			const ordered = order_entities(entities)
			expect(stems(ordered)).toEqual(['Paul', 'write', 'letter', 'Corinth'])
			expect(ordered.at(-2)?.value).toBe('.')
			expect(ordered.at(-1)?.value).toBe('}')
		})

		test('places an agent clause before the verb', () => {
			const agent_clause = clause({ type: 'Agent (Subject Complement)', children: [...vp('obey')] })
			const entities = main_clause([...vp('please'), ...np({ stem: 'God', role: 'Most Patient-like' }), ...agent_clause])

			expect(stems(order_entities(entities))).toEqual(['obey', 'please', 'God'])
		})

		test('orders nested clauses independently', () => {
			const patient_clause = clause({
				type: 'Patient (Object Complement)',
				children: [...vp('come'), ...np({ stem: 'John', role: 'Most Agent-like' })],
			})
			const entities = main_clause([...vp('say'), ...np({ stem: 'Paul', role: 'Most Agent-like' }), ...patient_clause])

			expect(stems(order_entities(entities))).toEqual(['Paul', 'say', 'John', 'come'])
		})

		const advp = (stem: string) => [entity({ category: 'Adverb Phrase', value: '(' }), entity({ category: 'Adverb', value: stem, concept: { stem, sense: 'A', part_of_speech: 'Adverb' } }), close(')')]
		const adverbial_clause = ({ adposition, children }: { adposition: string; children: EditorAnalyzedEntity[] }) => clause({
			type: 'Event Modifier (Adverbial Clause)',
			children: [entity({ category: 'Adposition', value: adposition, concept: { stem: adposition, sense: 'A', part_of_speech: 'Adposition' } }), ...children],
		})

		test('places adverb phrases at the end of the clause, before punctuation', () => {
			const exclamation = entity({ category: 'Particle', value: 'exclamation', concept: { stem: 'exclamation', sense: 'A', part_of_speech: 'Particle' } })
			const entities = main_clause([
				...advp('quickly'),
				...np({ stem: 'Paul', role: 'Most Agent-like' }),
				...vp('write'),
				...np({ stem: 'letter', role: 'Most Patient-like' }),
				exclamation,
			])

			const ordered = order_entities(entities)
			expect(stems(ordered)).toEqual(['Paul', 'write', 'letter', 'quickly', 'exclamation'])
			expect(ordered.at(-2)?.value).toBe('.')
		})

		test('places an adverbial clause at the end of its parent clause when its adposition is listed', () => {
			const because_clause = adverbial_clause({ adposition: 'because', children: [...vp('love')] })
			const entities = main_clause([...because_clause, ...vp('write'), ...advp('quickly')])

			expect(stems(order_entities(entities))).toEqual(['write', 'quickly', 'because', 'love'])
		})

		test('leaves an adverbial clause in place when its adposition is not listed', () => {
			const when_clause = adverbial_clause({ adposition: 'when', children: [...vp('arrive')] })
			const entities = main_clause([...when_clause, ...vp('write')])

			expect(stems(order_entities(entities))).toEqual(['when', 'arrive', 'write'])
		})

		test('leaves a clause without a verb unchanged', () => {
			const entities = main_clause([...np({ stem: 'letter', role: 'Most Patient-like' }), ...np({ stem: 'Paul', role: 'Most Agent-like' })])

			expect(order_entities(entities)).toEqual(entities)
		})
	})

	describe('features', () => {
		test('get_features_for_token extracts default features', () => {
			const token = create_token({ token: 'write-01', type: TOKEN_TYPE.LOOKUP_WORD, lookup_results: [create_lookup_result({ stem: 'write-01', part_of_speech: 'Verb', sense: 'A' })] })

			const features = get_features_for_token({ tokens: [token], token_index: 0, category: 'Verb' })
			expect(Array.isArray(features)).toBe(true)
		})
	})
})
