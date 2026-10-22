import { describe, expect, test } from 'vitest'
import { analyze } from './index'
import { entityfy } from './entityfy'
import { get_features_for_token } from './features'
import { replace_gaps } from './gaps'
import { order_constituents } from './ordering'
import { populate_noun_list, replace_punctuation } from './other_rules'
import { TOKEN_TYPE, create_gap_token, create_token, create_lookup_result } from '#lib/token.js'
import type { EditorAnalyzedEntity, PartOfSpeech } from '@tabitha/types'
import type { Sentence, Tag, Token } from '#lib/types.js'

const word = ({ stem, part_of_speech, tag = {} }: { stem: string; part_of_speech: PartOfSpeech; tag?: Tag }) => create_token({
	token: stem,
	type: TOKEN_TYPE.LOOKUP_WORD,
	lookup_results: [create_lookup_result({ stem, part_of_speech, sense: 'A' })],
	tag,
})
const phrase = ({ type, tag = {}, contents }: { type: string; tag?: Tag; contents: Token[] }) => [
	create_token({ token: `{${type}`, type: TOKEN_TYPE.PHRASE, tag }),
	...contents,
	create_token({ token: '}', type: TOKEN_TYPE.PHRASE }),
]
const np = ({ role, contents }: { role?: string; contents: Token[] }) => phrase({ type: 'NP', tag: role ? { role } : {}, contents })
const vp = (stem: string) => phrase({ type: 'VP', contents: [word({ stem, part_of_speech: 'Verb' })] })
const clause = ({ clause_type, sub_tokens }: { clause_type: string; sub_tokens: Token[] }) => create_token({ token: '[', type: TOKEN_TYPE.CLAUSE, tag: { clause_type }, sub_tokens })
const texts = (tokens: Token[]) => tokens.map(token => token.token)

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
		const noun = (stem: string) => word({ stem, part_of_speech: 'Noun' })
		const advp = (stem: string) => phrase({ type: 'AdvP', contents: [word({ stem, part_of_speech: 'Adverb' })] })
		const adverbial_clause = ({ adposition, sub_tokens }: { adposition: string; sub_tokens: Token[] }) => clause({
			clause_type: 'adverbial_clause',
			sub_tokens: [word({ stem: adposition, part_of_speech: 'Adposition' }), ...sub_tokens],
		})
		const period = () => create_token({ token: '.', type: TOKEN_TYPE.PUNCTUATION })
		const order_main_clause = (sub_tokens: Token[]) => order_constituents([{ clause: clause({ clause_type: 'main_clause', sub_tokens }) }])[0].clause.sub_tokens
		const stems = (tokens: Token[]): string[] => tokens.flatMap(token => token.type === TOKEN_TYPE.CLAUSE ? stems(token.sub_tokens) : token.lookup_results.map(lookup => lookup.stem))

		test('places the agent NP before the verb and the patient NP directly after it', () => {
			const tokens = order_main_clause([
				...np({ role: 'patient', contents: [noun('letter')] }),
				...vp('write'),
				...np({ role: 'agent', contents: [noun('Paul')] }),
				...np({ role: 'destination', contents: [noun('Corinth')] }),
				period(),
			])

			expect(stems(tokens)).toEqual(['Paul', 'write', 'letter', 'Corinth'])
			expect(tokens.at(-1)?.token).toBe('.')
		})

		test('places an agent clause before the verb', () => {
			const agent_clause = clause({ clause_type: 'agent_clause', sub_tokens: vp('obey') })
			const tokens = order_main_clause([...vp('please'), ...np({ role: 'patient', contents: [noun('God')] }), agent_clause])

			expect(stems(tokens)).toEqual(['obey', 'please', 'God'])
		})

		test('orders nested clauses independently', () => {
			const patient_clause = clause({
				clause_type: 'patient_clause_different_participant',
				sub_tokens: [...vp('come'), ...np({ role: 'agent', contents: [noun('John')] })],
			})
			const tokens = order_main_clause([...vp('say'), ...np({ role: 'agent', contents: [noun('Paul')] }), patient_clause])

			expect(stems(tokens)).toEqual(['Paul', 'say', 'John', 'come'])
		})

		test('places adverb phrases at the end of the clause, before punctuation', () => {
			const exclamation = word({ stem: 'exclamation', part_of_speech: 'Particle' })
			const tokens = order_main_clause([
				...advp('quickly'),
				...np({ role: 'agent', contents: [noun('Paul')] }),
				...vp('write'),
				...np({ role: 'patient', contents: [noun('letter')] }),
				exclamation,
				period(),
			])

			expect(stems(tokens)).toEqual(['Paul', 'write', 'letter', 'quickly', 'exclamation'])
			expect(tokens.at(-1)?.token).toBe('.')
		})

		test('places an adverbial clause at the end of its parent clause when its adposition is listed', () => {
			const because_clause = adverbial_clause({ adposition: 'because', sub_tokens: vp('love') })
			const tokens = order_main_clause([because_clause, ...vp('write'), ...advp('quickly')])

			expect(stems(tokens)).toEqual(['write', 'quickly', 'because', 'love'])
		})

		test('leaves an adverbial clause in place when its adposition is not listed', () => {
			const when_clause = adverbial_clause({ adposition: 'when', sub_tokens: vp('arrive') })
			const tokens = order_main_clause([when_clause, ...vp('write')])

			expect(stems(tokens)).toEqual(['when', 'arrive', 'write'])
		})

		test('leaves a clause without a verb unchanged', () => {
			const sub_tokens = [...np({ role: 'patient', contents: [noun('letter')] }), ...np({ role: 'agent', contents: [noun('Paul')] })]

			expect(order_main_clause(sub_tokens)).toEqual(sub_tokens)
		})
	})

	describe('gaps', () => {
		const gap = (label: string) => create_gap_token({ rule_id: 'test', label })
		const john = () => word({ stem: 'John', part_of_speech: 'Noun' })
		const replace_in_main_clause = (sub_tokens: Token[]) => replace_gaps([{ clause: clause({ clause_type: 'main_clause', sub_tokens }) }])[0].clause.sub_tokens

		test('GAP_REL is replaced with the modified NP, without its relative clause', () => {
			const relative_clause = clause({ clause_type: 'relative_clause', sub_tokens: [...np({ role: 'agent', contents: [gap('REL')] }), ...vp('leave')] })
			const tokens = replace_in_main_clause([
				...np({ role: 'agent', contents: [john()] }),
				...vp('see'),
				...np({ role: 'patient', contents: [word({ stem: 'man', part_of_speech: 'Noun' }), relative_clause] }),
			])

			const filled_clause = tokens.find(token => token.type === TOKEN_TYPE.CLAUSE)!
			expect(texts(filled_clause.sub_tokens)).toEqual(['{NP', 'man', '}', '{VP', 'leave', '}'])
			expect(filled_clause.sub_tokens[0].tag).toEqual({ role: 'agent' })
		})

		test('GAP_SAME_SUB is replaced with the agent NP of the parent clause', () => {
			const same_subject_clause = clause({ clause_type: 'patient_clause_same_participant', sub_tokens: [...np({ contents: [gap('SAME_SUB')] }), ...vp('go')] })
			const tokens = replace_in_main_clause([...np({ role: 'agent', contents: [john()] }), ...vp('want'), same_subject_clause])

			expect(texts(tokens.at(-1)!.sub_tokens)).toEqual(['{NP', 'John', '}', '{VP', 'go', '}'])
		})

		test('GAP_SAME_SUB is replaced with every agent NP of the parent clause, each keeping the gap role', () => {
			const same_subject_clause = clause({ clause_type: 'patient_clause_same_participant', sub_tokens: [...np({ role: 'patient', contents: [gap('SAME_SUB')] }), ...vp('go')] })
			const tokens = replace_in_main_clause([
				...np({ role: 'agent', contents: [john()] }),
				...np({ role: 'agent', contents: [word({ stem: 'and', part_of_speech: 'Conjunction' }), word({ stem: 'Mary', part_of_speech: 'Noun' })] }),
				...vp('want'),
				same_subject_clause,
			])

			const filled_tokens = tokens.at(-1)!.sub_tokens
			expect(texts(filled_tokens)).toEqual(['{NP', 'John', '}', '{NP', 'and', 'Mary', '}', '{VP', 'go', '}'])
			expect(filled_tokens[3].tag).toEqual({ role: 'patient' })
		})

		test('GAP_SAME_SUB uses a parent agent that was itself a filled gap', () => {
			const same_subject_clause = clause({ clause_type: 'patient_clause_same_participant', sub_tokens: [...np({ contents: [gap('SAME_SUB')] }), ...vp('go')] })
			const relative_clause = clause({ clause_type: 'relative_clause', sub_tokens: [...np({ role: 'agent', contents: [gap('REL')] }), ...vp('want'), same_subject_clause] })
			const tokens = replace_in_main_clause([...np({ role: 'agent', contents: [word({ stem: 'man', part_of_speech: 'Noun' }), relative_clause] }), ...vp('leave')])

			const filled_relative_clause = tokens.find(token => token.type === TOKEN_TYPE.CLAUSE)!
			expect(texts(filled_relative_clause.sub_tokens.at(-1)!.sub_tokens)).toEqual(['{NP', 'man', '}', '{VP', 'go', '}'])
		})

		const what = () => word({ stem: 'thing', part_of_speech: 'Noun', tag: { determiner: 'interrogative' } })

		test('the interrogative NP of the same clause is moved to GAP_INTV_N', () => {
			const tokens = replace_in_main_clause([
				...np({ contents: [what()] }),
				...np({ role: 'agent', contents: [john()] }),
				...vp('see'),
				...np({ role: 'patient', contents: [gap('INTV_N')] }),
			])

			expect(texts(tokens)).toEqual(['{NP', 'John', '}', '{VP', 'see', '}', '{NP', 'thing', '}'])
			expect(tokens.at(-3)!.tag).toEqual({ role: 'patient' })
		})

		test('the interrogative NP is moved to a GAP_INTV_N in a nested clause', () => {
			const patient_clause = clause({ clause_type: 'patient_clause_different_participant', sub_tokens: [...np({ role: 'agent', contents: [john()] }), ...vp('do'), ...np({ role: 'patient', contents: [gap('INTV_N')] })] })
			const tokens = replace_in_main_clause([...np({ contents: [what()] }), ...vp('want'), patient_clause])

			expect(texts(tokens)).toEqual(['{VP', 'want', '}', '['])
			expect(texts(tokens.at(-1)!.sub_tokens.slice(-3))).toEqual(['{NP', 'thing', '}'])
		})

		test('the interrogative NP stays in place when there is no GAP_INTV_N', () => {
			const tokens = replace_in_main_clause([...np({ role: 'agent', contents: [what()] }), ...vp('leave')])

			expect(texts(tokens)).toEqual(['{NP', 'thing', '}', '{VP', 'leave', '}'])
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
