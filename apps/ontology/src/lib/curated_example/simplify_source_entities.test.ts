import { describe, expect, it } from 'vitest'
import { encode_curated_example } from '#lib/transformers.js'
import { CuratedExampleSourceError, find_concept_word_indexes, simplify_source_entities } from './simplify_source_entities.js'
import type { ConceptKey, SourceEntity } from '@tabitha/types'

type Features = Record<string, string>

const reference = { type: 'Bible', id_primary: 'Exodus', id_secondary: '2', id_tertiary: '2' }

const concept = ({ stem, part_of_speech = 'Noun' }: { stem: string; part_of_speech?: ConceptKey['part_of_speech'] }): ConceptKey => ({ stem, sense: 'A', part_of_speech })

const entity = (overrides: Partial<SourceEntity>): SourceEntity => ({
	category: '', category_abbr: '', value: '', concept: null, pairing_concept: null, pairing_type: null,
	feature_codes: '', features: [], noun_list_index: null, ...overrides,
})
const to_features = (features: Features) => Object.entries(features).map(([name, value]) => ({ name, value }))

const open_clause = (features: Features = {}) => entity({ category: 'Clause', value: '{', features: to_features(features) })
const open_argument_clause = (type: string) => entity({ category: 'Clause', value: '[', features: to_features({ Type: type }) })
const close_clause = () => entity({ value: '}' })
const open_phrase = ({ category, features = {} }: { category: SourceEntity['category']; features?: Features }) => entity({ category, value: '(', features: to_features(features) })
const close_phrase = () => entity({ value: ')' })
const word = ({ category, stem, features = {}, noun_list_index = null }: { category: SourceEntity['category']; stem: string; features?: Features; noun_list_index?: string | null }) =>
	entity({ category, value: stem, concept: concept({ stem, part_of_speech: category as ConceptKey['part_of_speech'] }), features: to_features(features), noun_list_index })

const noun_phrase = ({ stem, role, noun_list_index = null }: { stem: string; role: string; noun_list_index?: string | null }) => [
	open_phrase({ category: 'Noun Phrase', features: { Sequence: 'Coordinate', 'Semantic Role': role } }),
	word({ category: 'Noun', stem, noun_list_index }),
	close_phrase(),
]
const verb_phrase = (stem: string) => [open_phrase({ category: 'Verb Phrase' }), word({ category: 'Verb', stem }), close_phrase()]

const index_of = ({ entities, stem }: { entities: SourceEntity[]; stem: string }) => entities.findIndex(({ value }) => value === stem)

const encode = ({ source_entities, stem }: { source_entities: SourceEntity[]; stem: string }): string => {
	const encoding = simplify_source_entities({ source_entities, word_index: index_of({ entities: source_entities, stem }) })
	const result = encode_curated_example({ reference, sentence: 'A sentence.', encoding })
	return 'encoded_example' in result ? result.encoded_example.replace('|~A sentence.', '').replace('4,2,2,2|', '') : result.error
}

describe('simplify_source_entities', () => {
	it('keeps the contents of the clause the word is in, not the clause itself', () => {
		const entities = [
			open_clause({ Type: 'Independent' }),
			...noun_phrase({ stem: 'baby', role: 'Most Agent-like' }),
			...verb_phrase('be'),
			open_phrase({ category: 'Adjective Phrase', features: { Usage: 'Predicative' } }), word({ category: 'Adjective', stem: 'beautiful' }), close_phrase(),
			close_clause(),
		]
		expect(encode({ source_entities: entities, stem: 'be' })).toBe('(NPA|baby|)|(VP|be|)|(APP|beautiful|)')
	})

	it('keeps the argument clauses of the clause, with their contents', () => {
		const entities = [
			open_clause({ Type: 'Independent' }),
			open_argument_clause('Agent (Subject Complement)'), ...noun_phrase({ stem: 'John', role: 'Most Agent-like' }), ...verb_phrase('read'), entity({ value: ']' }),
			...verb_phrase('be'),
			open_phrase({ category: 'Adjective Phrase', features: { Usage: 'Predicative' } }), word({ category: 'Adjective', stem: 'true' }), close_phrase(),
			close_clause(),
		]
		expect(encode({ source_entities: entities, stem: 'be' })).toBe('[A|(NPA|John|)|(VP|read|)|]|(VP|be|)|(APP|true|)')
	})

	it('uses the clause the word is in when that is an argument clause, and leaves out the rest of the verse', () => {
		const entities = [
			open_clause({ Type: 'Independent' }), ...noun_phrase({ stem: 'Mary', role: 'Most Agent-like' }),
			open_argument_clause('Patient (Object Complement)'), ...noun_phrase({ stem: 'John', role: 'Most Agent-like' }), ...verb_phrase('read'), entity({ value: ']' }),
			close_clause(),
		]
		expect(encode({ source_entities: entities, stem: 'read' })).toBe('(NPA|John|)|(VP|read|)')
	})

	it('leaves out clauses that are not argument clauses, and clauses nested in an argument clause', () => {
		const entities = [
			open_clause({ Type: 'Independent' }),
			...verb_phrase('know'),
			open_phrase({ category: 'Noun Phrase', features: { 'Semantic Role': 'Most Patient-like' } }),
			word({ category: 'Noun', stem: 'man' }),
			open_clause({ Type: 'Restrictive Thing Modifier (Relative Clause)' }), ...verb_phrase('sin'), close_clause(),
			close_phrase(),
			open_argument_clause('Patient (Object Complement)'), ...verb_phrase('go'), open_clause({ Type: 'Event Modifier (Adverbial Clause)' }), ...verb_phrase('run'), close_clause(), entity({ value: ']' }),
			close_clause(),
		]
		expect(encode({ source_entities: entities, stem: 'know' })).toBe('(VP|know|)|(NPP|man|)|[P|(VP|go|)|]')
	})

	it('leaves out what the format has no place for', () => {
		const entities = [
			open_clause({ Type: 'Independent' }),
			entity({ category: 'Format Marker', value: 'Paragraph' }),
			...verb_phrase('rain'),
			entity({ category: 'Noun', value: 'unanalyzed' }),
			entity({ category: 'period', value: '.' }),
			close_clause(),
		]
		expect(encode({ source_entities: entities, stem: 'rain' })).toBe('(VP|rain|)')
	})

	it('writes the concept stem, not the word as it appears', () => {
		const entities = [open_clause(), open_phrase({ category: 'Verb Phrase' }), { ...word({ category: 'Verb', stem: 'be' }), value: 'was' }, close_phrase(), close_clause()]
		expect(encode({ source_entities: entities, stem: 'was' })).toBe('(VP|be|)')
	})

	it('has a noun phrase with a semantic role that has no code, and one with none, written without a feature', () => {
		const entities = [
			open_clause(),
			open_phrase({ category: 'Noun Phrase', features: { 'Semantic Role': 'Not Applicable' } }), word({ category: 'Noun', stem: 'man' }), close_phrase(),
			...verb_phrase('go'),
			close_clause(),
		]
		const encoding = simplify_source_entities({ source_entities: entities, word_index: index_of({ entities, stem: 'go' }) })
		expect(encoding[0]).toEqual({ category: 'Noun Phrase', category_abbr: 'NP', value: '(', feature_codes: '', features: [] })
	})

	it('keeps the degree of an adjective, unless it has none', () => {
		const adjective_encoding = (degree: string) => {
			const entities = [open_clause(), open_phrase({ category: 'Adjective Phrase' }), word({ category: 'Adjective', stem: 'good', features: { Degree: degree } }), close_phrase(), close_clause()]
			return simplify_source_entities({ source_entities: entities, word_index: index_of({ entities, stem: 'good' }) }).find(({ category }) => category === 'Adjective')
		}

		expect(adjective_encoding('Comparative')?.features).toEqual([{ name: 'Degree', value: 'Comparative' }])
		expect(adjective_encoding('No Degree')?.features).toEqual([])
	})

	describe('the participant of an argument clause of an adjective', () => {
		const ready_to = ({ outer_index, inner_index }: { outer_index: string; inner_index: string }) => {
			const entities = [
				open_clause({ Type: 'Independent' }),
				...noun_phrase({ stem: 'John', role: 'Most Agent-like', noun_list_index: outer_index }),
				...verb_phrase('be'),
				open_phrase({ category: 'Adjective Phrase', features: { Usage: 'Predicative' } }),
				word({ category: 'Adjective', stem: 'ready' }),
				open_argument_clause('Attributive Patient (Adjectival Object Complement)'),
				...noun_phrase({ stem: 'John', role: 'Most Agent-like', noun_list_index: inner_index }),
				...verb_phrase('read'),
				entity({ value: ']' }),
				close_phrase(),
				close_clause(),
			]
			const encoding = simplify_source_entities({ source_entities: entities, word_index: index_of({ entities, stem: 'ready' }) })
			return encoding.find(({ category }) => category === 'Clause')
		}

		it('is the same when the agents are the same participant', () => {
			expect(ready_to({ outer_index: 'A', inner_index: 'A' })).toEqual({
				category: 'Clause', category_abbr: 'Prop', value: '[', feature_codes: 'p',
				features: [
					{ name: 'Type', value: 'Attributive Patient (Adjectival Object Complement)' },
					{ name: 'Participant', value: 'Same' },
				],
			})
		})

		it('is different when the agents are different participants', () => {
			expect(ready_to({ outer_index: 'A', inner_index: 'B' })?.features).toContainEqual({ name: 'Participant', value: 'Different' })
		})
	})

	it('cannot make an example when the word is not in a clause', () => {
		const entities = verb_phrase('go')
		expect(() => simplify_source_entities({ source_entities: entities, word_index: 1 })).toThrow(CuratedExampleSourceError)
	})
})

describe('find_concept_word_indexes', () => {
	it('lists the words that use the concept, in order', () => {
		const entities = [open_clause(), ...verb_phrase('go'), ...verb_phrase('stay'), ...verb_phrase('go'), close_clause()]
		const go = concept({ stem: 'go', part_of_speech: 'Verb' })
		expect(find_concept_word_indexes({ source_entities: entities, concept: go })).toEqual([2, 8])
		expect(find_concept_word_indexes({ source_entities: entities, concept: { ...go, sense: 'B' } })).toEqual([])
	})
})
