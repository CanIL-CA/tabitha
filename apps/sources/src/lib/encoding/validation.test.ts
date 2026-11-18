import { describe, expect, test } from 'vitest'
import { check_alternates, check_case_frames, check_concept_level, check_noun_list, check_phrase_structure, check_unset_features, validate_encoding } from './validation'
import { structure_entities } from './structured'
import { DEFAULTS } from '#lib/edit/default_entities.js'
import { group_senses_by_concept } from '#lib/data/ontology_senses.js'
import type { ConceptKey, OntologyResult, PairingType } from '@tabitha/types'
import type { PageSourceEntity } from '#lib/types.js'

type Features = Record<string, string>

const to_features = (features: Features) => Object.entries(features).map(([name, value]) => ({ name, value }))

const open_clause = (features: Features = {}): PageSourceEntity => ({
	...DEFAULTS.EMPTY, category: 'Clause', category_abbr: 'C', value: '{', features: to_features(features),
})
const close_clause = (): PageSourceEntity => ({ ...DEFAULTS.EMPTY, value: '}' })
const open_phrase = ({ category, features = {} }: { category: 'Noun Phrase' | 'Verb Phrase' | 'Adjective Phrase' | 'Adverb Phrase'; features?: Features }): PageSourceEntity => ({
	...DEFAULTS.EMPTY, category, category_abbr: 'P', value: '(', features: to_features(features),
})
const close_phrase = (): PageSourceEntity => ({ ...DEFAULTS.EMPTY, value: ')' })

const word = ({ category, concept, pairing_concept = null, pairing_type = null, noun_list_index = null, features = {} }: {
	category: 'Noun' | 'Verb' | 'Adjective' | 'Adverb' | 'Adposition' | 'Conjunction'
	concept: ConceptKey
	pairing_concept?: ConceptKey | null
	pairing_type?: PairingType | null
	noun_list_index?: string | null
	features?: Features
}): PageSourceEntity => ({
	...DEFAULTS.EMPTY, category, value: concept.stem, concept, pairing_concept, pairing_type, noun_list_index, features: to_features(features),
})

const structured = (entities: PageSourceEntity[]): PageSourceEntity[] => {
	structure_entities(entities)
	return entities
}

const concept = ({ stem, part_of_speech = 'Noun' }: { stem: string; part_of_speech?: ConceptKey['part_of_speech'] }): ConceptKey => ({ stem, sense: 'A', part_of_speech })

const sense = ({ concept, level = '0', categories = [] }: { concept: ConceptKey; level?: string; categories?: string[] }): OntologyResult => ({
	...concept, level, gloss: '', categorization: '', categories, status: 'in ontology', how_to_hints: [],
})

const clause_with = (features: Features): PageSourceEntity[] => [open_clause(features), close_clause()]

describe('check_alternates', () => {
	test('accepts a literal alternate directly followed by a dynamic alternate', () => {
		const entities = structured([
			...clause_with({ 'Alternative Analysis': 'Literal Alternate' }),
			...clause_with({ 'Alternative Analysis': 'Dynamic Alternate' }),
		])
		expect(check_alternates({ source_entities: entities })).toEqual([])
	})

	test('flags a literal alternate with no following dynamic alternate', () => {
		const entities = structured([...clause_with({ 'Alternative Analysis': 'Literal Alternate' })])
		expect(check_alternates({ source_entities: entities })).toEqual([{
			check: 'alternate',
			entity_id: 0,
			feature_name: 'Alternative Analysis',
			value: 'Literal Alternate',
			expected: { direction: 'after', values: ['Dynamic Alternate'] },
			severity: 'error',
		}])
	})

	test('flags a dynamic alternate with no preceding literal alternate', () => {
		const entities = structured([...clause_with({ 'Alternative Analysis': 'Dynamic Alternate' })])
		expect(check_alternates({ source_entities: entities }).map(({ expected }) => expected.direction)).toEqual(['before'])
	})

	test('requires each numbered alternate to follow the one before it, but not to be followed', () => {
		const entities = structured([
			...clause_with({ 'Alternative Analysis': 'Primary Analysis' }),
			...clause_with({ 'Alternative Analysis': 'First Alternative Analysis' }),
			...clause_with({ 'Alternative Analysis': 'Second Alternative Analysis' }),
		])
		expect(check_alternates({ source_entities: entities })).toEqual([])
	})

	test('flags a second alternate that does not directly follow the first', () => {
		const entities = structured([
			...clause_with({ 'Alternative Analysis': 'Primary Analysis' }),
			...clause_with({ 'Alternative Analysis': 'Not Applicable' }),
			...clause_with({ 'Alternative Analysis': 'First Alternative Analysis' }),
			...clause_with({ 'Alternative Analysis': 'Third Alternative Analysis' }),
		])
		const flagged = check_alternates({ source_entities: entities }).map(({ entity_id, value }) => [entity_id, value])
		expect(flagged).toEqual([[0, 'Primary Analysis'], [4, 'First Alternative Analysis'], [6, 'Third Alternative Analysis']])
	})

	test('does not treat clauses with a format marker between them as adjacent', () => {
		const format_marker: PageSourceEntity = { ...DEFAULTS.EMPTY, category: 'Format Marker', value: 'Paragraph' }
		const entities = structured([
			...clause_with({ 'Alternative Analysis': 'Biblical Units' }),
			format_marker,
			...clause_with({ 'Alternative Analysis': 'Contemporary Units' }),
		])
		const flagged = check_alternates({ source_entities: entities }).map(({ entity_id, expected }) => [entity_id, expected.direction])
		expect(flagged).toEqual([[0, 'after'], [3, 'before']])
	})

	test('does not pair clauses that are not siblings', () => {
		const entities = structured([
			open_clause({ 'Alternative Analysis': 'Literal Alternate' }),
			...clause_with({ 'Alternative Analysis': 'Dynamic Alternate' }),
			close_clause(),
		])
		const flagged = check_alternates({ source_entities: entities }).map(({ entity_id, expected }) => [entity_id, expected.direction])
		expect(flagged).toEqual([[0, 'after'], [1, 'before']])
	})

	test('requires an equivalent statement after any rhetorical question value', () => {
		const paired = structured([
			...clause_with({ 'Rhetorical Question': "Yes-No Question Expects 'No'" }),
			...clause_with({ 'Rhetorical Question': 'Equivalent Statement' }),
		])
		expect(check_alternates({ source_entities: paired })).toEqual([])

		const unpaired = structured([...clause_with({ 'Rhetorical Question': 'Content Rhetorical Question' })])
		expect(check_alternates({ source_entities: unpaired })).toHaveLength(1)
	})

	test('leaves Not Applicable rhetorical questions alone', () => {
		const entities = structured([...clause_with({ 'Rhetorical Question': 'Not Applicable' })])
		expect(check_alternates({ source_entities: entities })).toEqual([])
	})

	describe('vocabulary alternates', () => {
		const COMPLEX = (position: string) => `${position} Sentence - Complex Vocabulary Alternate`
		const SIMPLE = (position: string) => `${position} Sentence - Simple Vocabulary Alternate`

		const flagged_for = (values: string[]) => {
			const entities = structured(values.flatMap(value => clause_with({ 'Vocabulary Alternate': value })))
			return check_alternates({ source_entities: entities }).map(({ entity_id, expected }) => [entity_id / 2, expected.direction])
		}

		test('accepts a single complex clause followed by a single simple clause', () => {
			expect(flagged_for([COMPLEX('Single'), SIMPLE('Single')])).toEqual([])
		})

		test('accepts a full sequence for each version', () => {
			const values = [COMPLEX('First'), COMPLEX('Coordinate'), COMPLEX('Last'), SIMPLE('First'), SIMPLE('Coordinate'), SIMPLE('Last')]
			expect(flagged_for(values)).toEqual([])
		})

		test('accepts any number of simple clauses for a complex clause, and the reverse', () => {
			expect(flagged_for([COMPLEX('Single'), SIMPLE('First'), SIMPLE('Last')])).toEqual([])
			expect(flagged_for([COMPLEX('First'), COMPLEX('Last'), SIMPLE('Single')])).toEqual([])
		})

		test('accepts several versions one after another', () => {
			const values = [COMPLEX('Single'), SIMPLE('Single'), COMPLEX('First'), COMPLEX('Last'), SIMPLE('Single')]
			expect(flagged_for(values)).toEqual([])
		})

		test('flags a complex clause with no simple clause after it', () => {
			expect(flagged_for([COMPLEX('Single')])).toEqual([[0, 'after']])
		})

		test('flags a simple clause with no complex clause before it', () => {
			expect(flagged_for([SIMPLE('Single')])).toEqual([[0, 'before']])
			expect(flagged_for([SIMPLE('First'), SIMPLE('Last')])).toEqual([[0, 'before']])
		})

		test('expects a first complex clause to be followed by more of the same version', () => {
			expect(flagged_for([COMPLEX('First'), SIMPLE('Single')])).toEqual([[0, 'after'], [1, 'before']])
		})

		test('expects a last complex clause to be preceded by the rest of its version', () => {
			expect(flagged_for([COMPLEX('Last'), SIMPLE('Single')])).toEqual([[0, 'before']])
			expect(flagged_for([COMPLEX('Coordinate'), COMPLEX('Last'), SIMPLE('Single')])).toEqual([[0, 'before']])
		})

		test('does not allow a version to continue with a clause of the other version', () => {
			expect(flagged_for([COMPLEX('First'), SIMPLE('Coordinate'), SIMPLE('Last')]).length).toBeGreaterThan(0)
		})
	})
})

describe('check_unset_features', () => {
	test('reports the names of features with an empty value', () => {
		const entities = structured([
			open_clause({ Type: 'Independent', 'Illocutionary Force': '', Location: '' }),
			close_clause(),
		])
		expect(check_unset_features({ source_entities: entities })).toEqual([
			{ check: 'unset_feature', entity_id: 0, feature_names: ['Illocutionary Force', 'Location'] },
		])
	})

	test('ignores spare features and entities with every feature set', () => {
		const entities = structured([open_clause({ Type: 'Independent', 'Spare 1': '' }), close_clause()])
		expect(check_unset_features({ source_entities: entities })).toEqual([])
	})
})

describe('check_noun_list', () => {
	test('flags an index assigned more than one concept', () => {
		const entities = structured([
			word({ category: 'Noun', concept: concept({ stem: 'tree' }), noun_list_index: '1' }),
			word({ category: 'Noun', concept: concept({ stem: 'rock' }), noun_list_index: '1' }),
			word({ category: 'Noun', concept: concept({ stem: 'river' }), noun_list_index: '2' }),
		])
		expect(check_noun_list({ source_entities: entities })).toEqual([
			{ check: 'noun_list', reason: 'multiple_concepts', noun_list_index: '1', entity_ids: [0, 1], nouns: ['tree-A', 'rock-A'] },
		])
	})

	test('flags an index with no nouns when a later index is in use', () => {
		const entities = structured([
			word({ category: 'Noun', concept: concept({ stem: 'tree' }), noun_list_index: '1' }),
			word({ category: 'Noun', concept: concept({ stem: 'river' }), noun_list_index: '4' }),
		])
		expect(check_noun_list({ source_entities: entities })).toEqual([
			{ check: 'noun_list', reason: 'unused_index', noun_list_index: '2' },
			{ check: 'noun_list', reason: 'unused_index', noun_list_index: '3' },
		])
	})

	test('does not flag unused indexes after the last one in use', () => {
		const entities = structured([word({ category: 'Noun', concept: concept({ stem: 'tree' }), noun_list_index: '1' })])
		expect(check_noun_list({ source_entities: entities })).toEqual([])
	})

	test('accepts several entities sharing one concept', () => {
		const entities = structured([
			word({ category: 'Noun', concept: concept({ stem: 'tree' }), noun_list_index: '1' }),
			word({ category: 'Noun', concept: concept({ stem: 'tree' }), noun_list_index: '1' }),
		])
		expect(check_noun_list({ source_entities: entities })).toEqual([])
	})
})

describe('check_concept_level', () => {
	const SIMPLE = concept({ stem: 'follower' })
	const COMPLEX = concept({ stem: 'disciple' })
	const senses = group_senses_by_concept([
		sense({ concept: SIMPLE, level: '1' }),
		sense({ concept: COMPLEX, level: '3' }),
	])

	test('accepts a simple concept paired with a complex one', () => {
		const entities = structured([word({ category: 'Noun', concept: SIMPLE, pairing_concept: COMPLEX, pairing_type: 'simple-complex' })])
		expect(check_concept_level({ source_entities: entities, senses })).toEqual([])
	})

	test('flags a pairing whose members have swapped levels', () => {
		const entities = structured([word({ category: 'Noun', concept: COMPLEX, pairing_concept: SIMPLE, pairing_type: 'simple-complex' })])
		expect(check_concept_level({ source_entities: entities, senses }).map(({ reason }) => reason))
			.toEqual(['concept_not_simple', 'pairing_concept_not_complex'])
	})

	test('flags a complex concept outside a complex alternate', () => {
		const entities = structured([word({ category: 'Noun', concept: COMPLEX })])
		expect(check_concept_level({ source_entities: entities, senses })).toEqual([
			{ check: 'concept_level', entity_id: 0, concept: COMPLEX, level: 3, reason: 'complex_outside_complex_context' },
		])
	})

	test('accepts a complex concept nested within a complex alternate', () => {
		const entities = structured([
			open_clause({ 'Vocabulary Alternate': 'Single Sentence - Complex Vocabulary Alternate' }),
			open_phrase({ category: 'Noun Phrase' }),
			word({ category: 'Noun', concept: COMPLEX }),
			close_phrase(),
			close_clause(),
		])
		expect(check_concept_level({ source_entities: entities, senses })).toEqual([])
	})

	test('skips concepts whose level is unknown', () => {
		const entities = structured([word({ category: 'Noun', concept: concept({ stem: 'mystery' }) })])
		expect(check_concept_level({ source_entities: entities, senses })).toEqual([])
	})
})

describe('check_case_frames', () => {
	const GIVE = concept({ stem: 'give', part_of_speech: 'Verb' })
	const senses = group_senses_by_concept([
		sense({ concept: GIVE, categories: ['Agent-like', 'Patient-like', '', '', '', '', '(Beneficiary)', '', ''] }),
	])

	const clause_with_arguments = (roles: string[]): PageSourceEntity[] => [
		open_clause({ Type: 'Independent' }),
		open_phrase({ category: 'Verb Phrase' }),
		word({ category: 'Verb', concept: GIVE }),
		close_phrase(),
		...roles.flatMap(role => [open_phrase({ category: 'Noun Phrase', features: { 'Semantic Role': role } }), close_phrase()]),
		close_clause(),
	]

	test('accepts arguments matching the required categories, with optional ones absent', () => {
		const entities = structured(clause_with_arguments(['Most Agent-like', 'Most Patient-like']))
		expect(check_case_frames({ source_entities: entities, senses })).toEqual([])
	})

	test('accepts an optional category when it is present', () => {
		const entities = structured(clause_with_arguments(['Most Agent-like', 'Most Patient-like', 'Beneficiary']))
		expect(check_case_frames({ source_entities: entities, senses })).toEqual([])
	})

	test('flags a missing required argument and an unexpected one', () => {
		const entities = structured(clause_with_arguments(['Most Agent-like', 'Instrument']))
		expect(check_case_frames({ source_entities: entities, senses })).toEqual([{
			check: 'case_frame',
			reason: 'frame_mismatch',
			category: 'Verb',
			concept: GIVE,
			entity_id: 2,
			present: ['Agent-like', 'Instrument'],
			current_categories: ['Agent-like', 'Patient-like', '(Beneficiary)'],
			missing_required: ['Patient-like'],
			unexpected: ['Instrument'],
		}])
	})

	test('flags a verb with no ontology categories', () => {
		const entities = structured(clause_with_arguments(['Most Agent-like']))
		expect(check_case_frames({ source_entities: entities, senses: {} })).toEqual([
			{ check: 'case_frame', reason: 'no_categories', entity_ids: [2], category: 'Verb', concept: GIVE },
		])
	})

	test('reports a concept with no categories once, listing every entity that uses it', () => {
		const entities = structured([...clause_with_arguments([]), ...clause_with_arguments([])])
		expect(check_case_frames({ source_entities: entities, senses: {} })).toEqual([
			{ check: 'case_frame', reason: 'no_categories', entity_ids: [2, 7], category: 'Verb', concept: GIVE },
		])
	})

	describe('with a pairing', () => {
		const HAND_OVER = concept({ stem: 'hand over', part_of_speech: 'Verb' })

		const paired_verb_with_arguments = (roles: string[]): PageSourceEntity[] => {
			const unpaired = clause_with_arguments(roles)
			const paired = word({ category: 'Verb', concept: GIVE, pairing_concept: HAND_OVER, pairing_type: 'simple-complex' })
			return unpaired.map(entity => entity.category === 'Verb' ? paired : entity)
		}

		const issues_for_senses = ({ roles, pairing_categories }: { roles: string[]; pairing_categories: string[] }) =>
			check_case_frames({
				source_entities: structured(paired_verb_with_arguments(roles)),
				senses: group_senses_by_concept([
					sense({ concept: GIVE, categories: ['Agent-like', 'Patient-like', '', '', '', '', '(Beneficiary)', '', ''] }),
					sense({ concept: HAND_OVER, categories: pairing_categories }),
				]),
			})

		test('accepts a pairing whose concepts both match the arguments', () => {
			const pairing_categories = ['Agent-like', 'Patient-like', '', '', '', '', '', '', '']
			expect(issues_for_senses({ roles: ['Most Agent-like', 'Most Patient-like'], pairing_categories })).toEqual([])
		})

		test('flags only the pairing concept when its categories do not match', () => {
			const pairing_categories = ['Agent-like', 'Patient-like', 'State', '', '', '', '', '', '']
			expect(issues_for_senses({ roles: ['Most Agent-like', 'Most Patient-like'], pairing_categories })).toMatchObject([
				{ reason: 'frame_mismatch', concept: HAND_OVER, missing_required: ['State'] },
			])
		})

		test('flags a pairing concept with no categories, and a main concept with none', () => {
			const issues = issues_for_senses({ roles: ['Most Agent-like', 'Most Patient-like'], pairing_categories: [] })
			expect(issues).toMatchObject([{ reason: 'no_categories', concept: HAND_OVER }])

			const none_at_all = check_case_frames({ source_entities: structured(paired_verb_with_arguments([])), senses: {} })
			expect(none_at_all.map(({ concept }) => concept)).toEqual([GIVE, HAND_OVER])
		})
	})
})

// Builds the 'always'/'sometimes'/'never' usage lines the ontology returns, with any position not listed being 'never'.
const usage_categories = ({ count, frequencies }: { count: number; frequencies: Record<number, 'always' | 'sometimes'> }): string[] =>
	Array.from({ length: count }, (_, i) => `${frequencies[i] ?? 'never'} used in some way`)

const noun_phrase = ({ stem, features = {}, noun_list_index = null }: { stem: string; features?: Features; noun_list_index?: string | null }): PageSourceEntity[] => [
	open_phrase({ category: 'Noun Phrase', features }),
	word({ category: 'Noun', concept: concept({ stem }), noun_list_index }),
	close_phrase(),
]

describe('check_case_frames for words other than verbs', () => {
	const issues_for = ({ entities, concept: word_concept, categories }: { entities: PageSourceEntity[]; concept: ConceptKey; categories: string[] }) =>
		check_case_frames({ source_entities: structured(entities), senses: group_senses_by_concept([sense({ concept: word_concept, categories })]) })

	test.each(['Adjective', 'Adposition', 'Adverb', 'Conjunction'] as const)('flags a %s with no ontology categories', category => {
		const word_concept = concept({ stem: 'word', part_of_speech: category })
		const entities = [open_clause(), word({ category, concept: word_concept }), close_clause()]
		expect(issues_for({ entities, concept: word_concept, categories: [] })).toMatchObject([{ reason: 'no_categories', category }])
	})

	describe('conjunctions', () => {
		const AND = concept({ stem: 'and', part_of_speech: 'Conjunction' })
		const categories = usage_categories({ count: 4, frequencies: { 1: 'always' } })

		test('accepts a conjunction conjoining the phrases the ontology requires', () => {
			const entities = [open_clause(), open_phrase({ category: 'Noun Phrase' }), word({ category: 'Conjunction', concept: AND }), close_phrase(), close_clause()]
			expect(issues_for({ entities, concept: AND, categories })).toEqual([])
		})

		test('flags a conjunction used where the ontology says never and missing the one it always uses', () => {
			const entities = [open_clause(), word({ category: 'Conjunction', concept: AND }), close_clause()]
			expect(issues_for({ entities, concept: AND, categories })).toMatchObject([
				{ category: 'Conjunction', entity_id: 1, present: ['conjoin_clauses'], missing_required: ['conjoin_noun_phrases'], unexpected: ['conjoin_clauses'] },
			])
		})
	})

	describe('adverbs', () => {
		const QUICKLY = concept({ stem: 'quickly', part_of_speech: 'Adverb' })
		const categories = usage_categories({ count: 3, frequencies: { 0: 'sometimes' } })

		test('uses the parent of the adverb phrase to find what the adverb modifies', () => {
			const modifying_verb = [open_clause(), open_phrase({ category: 'Adverb Phrase' }), word({ category: 'Adverb', concept: QUICKLY }), close_phrase(), close_clause()]
			expect(issues_for({ entities: modifying_verb, concept: QUICKLY, categories })).toEqual([])

			const modifying_noun = [open_phrase({ category: 'Noun Phrase' }), open_phrase({ category: 'Adverb Phrase' }), word({ category: 'Adverb', concept: QUICKLY }), close_phrase(), close_phrase()]
			expect(issues_for({ entities: modifying_noun, concept: QUICKLY, categories })).toMatchObject([{ present: ['modify_noun_phrase'], unexpected: ['modify_noun_phrase'] }])
		})
	})

	describe('adpositions', () => {
		const IN = concept({ stem: 'in', part_of_speech: 'Adposition' })
		const adposition = word({ category: 'Adposition', concept: IN })

		test('treats a noun phrase directly in a clause as an adjunct phrase', () => {
			const entities = [open_clause(), open_phrase({ category: 'Noun Phrase' }), adposition, close_phrase(), close_clause()]
			const categories = usage_categories({ count: 3, frequencies: { 0: 'always' } })
			expect(issues_for({ entities, concept: IN, categories })).toEqual([])
		})

		test('treats a noun phrase within a noun phrase as a noun-noun phrase', () => {
			const entities = [open_phrase({ category: 'Noun Phrase' }), open_phrase({ category: 'Noun Phrase' }), adposition, close_phrase(), close_phrase()]
			const categories = usage_categories({ count: 3, frequencies: { 0: 'always' } })
			expect(issues_for({ entities, concept: IN, categories })).toMatchObject([{ present: ['noun_noun_phrase'], missing_required: ['adjunct_phrase'] }])
		})

		test('treats an adposition directly in a clause as introducing an adverbial clause', () => {
			const entities = [open_clause(), adposition, close_clause()]
			const categories = usage_categories({ count: 3, frequencies: { 2: 'sometimes' } })
			expect(issues_for({ entities, concept: IN, categories })).toEqual([])
		})
	})

	describe('adjectives', () => {
		const BIG = concept({ stem: 'big', part_of_speech: 'Adjective' })
		const with_semantic_category = (usages: string[]) => ['Generic', ...usages]
		const only = (index: number) => with_semantic_category(usage_categories({ count: 6, frequencies: { [index]: 'always' } }))

		// The Usage feature is deliberately set to the opposite of the structure, since only the structure should matter.
		const adjective_phrase = ({ parent, degree = 'No Degree', children = [] }: { parent: 'Noun Phrase' | 'Clause'; degree?: string; children?: PageSourceEntity[] }): PageSourceEntity[] => {
			const [open_parent, close_parent] = parent === 'Clause' ? [open_clause(), close_clause()] : [open_phrase({ category: 'Noun Phrase' }), close_phrase()]
			const misleading_usage = parent === 'Clause' ? 'Attributive' : 'Predicative'
			return [
				open_parent,
				open_phrase({ category: 'Adjective Phrase', features: { Usage: misleading_usage } }),
				word({ category: 'Adjective', concept: BIG, features: { Degree: degree } }),
				...children,
				close_phrase(),
				close_parent,
			]
		}

		test('detects attributive usage from an adjective phrase in a noun phrase', () => {
			expect(issues_for({ entities: adjective_phrase({ parent: 'Noun Phrase' }), concept: BIG, categories: only(0) })).toEqual([])
		})

		test('detects predicative usage without an argument from an adjective phrase in a clause', () => {
			expect(issues_for({ entities: adjective_phrase({ parent: 'Clause' }), concept: BIG, categories: only(1) })).toEqual([])
		})

		test('detects predicative usage with a nominal argument', () => {
			const entities = adjective_phrase({ parent: 'Clause', children: noun_phrase({ stem: 'king' }) })
			expect(issues_for({ entities, concept: BIG, categories: only(2) })).toEqual([])
		})

		test('skips an adjective phrase whose parent gives no structural usage', () => {
			const entities = [
				open_phrase({ category: 'Adjective Phrase' }),
				open_phrase({ category: 'Adjective Phrase' }),
				word({ category: 'Adjective', concept: BIG }),
				close_phrase(),
				close_phrase(),
			]
			expect(issues_for({ entities, concept: BIG, categories: only(0) })).toEqual([])
		})

		test('detects comparative usage alongside the phrase usage', () => {
			const entities = adjective_phrase({ parent: 'Noun Phrase', degree: 'Intensified Comparative' })
			const categories = with_semantic_category(usage_categories({ count: 6, frequencies: { 0: 'always', 5: 'always' } }))
			expect(issues_for({ entities, concept: BIG, categories })).toEqual([])
		})

		test('flags an adjective whose usage the ontology never allows', () => {
			const entities = adjective_phrase({ parent: 'Noun Phrase' })
			expect(issues_for({ entities, concept: BIG, categories: only(1) })).toMatchObject([
				{ present: ['attributive'], missing_required: ['predicative_without_argument'], unexpected: ['attributive'] },
			])
		})

		const clausal_argument = ({ outer_agent, inner_agent }: { outer_agent: string; inner_agent: string }): PageSourceEntity[] => [
			open_clause({ Type: 'Independent' }),
			...noun_phrase({ stem: 'saul', features: { 'Semantic Role': 'Most Agent-like' }, noun_list_index: outer_agent }),
			open_phrase({ category: 'Adjective Phrase', features: { Usage: 'Predicative' } }),
			word({ category: 'Adjective', concept: BIG, features: { Degree: 'No Degree' } }),
			open_clause({ Type: 'Attributive Patient (Adjectival Object Complement)' }),
			...noun_phrase({ stem: 'saul', features: { 'Semantic Role': 'Most Agent-like' }, noun_list_index: inner_agent }),
			close_clause(),
			close_phrase(),
			close_clause(),
		]

		test('treats a clausal argument with the same agent as a same-participant clause', () => {
			const entities = clausal_argument({ outer_agent: '1', inner_agent: '1' })
			expect(issues_for({ entities, concept: BIG, categories: only(3) })).toEqual([])
		})

		test('treats a clausal argument with a different agent as a different-participant clause', () => {
			const entities = clausal_argument({ outer_agent: '1', inner_agent: '2' })
			expect(issues_for({ entities, concept: BIG, categories: only(4) })).toEqual([])
			expect(issues_for({ entities, concept: BIG, categories: only(3) })).toMatchObject([
				{ present: ['predicative_with_different_participant_clause'], missing_required: ['predicative_with_same_participant_clause'] },
			])
		})

		test('flags a same-participant clause when the ontology never allows one', () => {
			const entities = clausal_argument({ outer_agent: '1', inner_agent: '1' })
			expect(issues_for({ entities, concept: BIG, categories: only(4) })).toMatchObject([
				{ present: ['predicative_with_same_participant_clause'], unexpected: ['predicative_with_same_participant_clause'] },
			])
		})
	})
})

describe('check_phrase_structure', () => {
	const issue_reasons = (entities: PageSourceEntity[]) => check_phrase_structure({ source_entities: structured(entities) }).map(({ reason }) => reason)

	test('accepts a phrase with exactly one head word', () => {
		expect(issue_reasons([open_clause(), ...noun_phrase({ stem: 'tree' }), close_clause()])).toEqual([])
	})

	test('flags a phrase with no head word', () => {
		const entities = [open_clause(), open_phrase({ category: 'Noun Phrase' }), close_phrase(), close_clause()]
		expect(check_phrase_structure({ source_entities: structured(entities) })).toEqual([
			{ check: 'phrase_structure', reason: 'phrase_without_head', entity_id: 1, head_category: 'Noun', head_ids: [] },
		])
	})

	test('flags a phrase with more than one head word', () => {
		const entities = [
			open_phrase({ category: 'Noun Phrase' }),
			word({ category: 'Noun', concept: concept({ stem: 'tree' }) }),
			word({ category: 'Noun', concept: concept({ stem: 'rock' }) }),
			close_phrase(),
		]
		expect(check_phrase_structure({ source_entities: structured(entities) })).toMatchObject([
			{ reason: 'phrase_with_multiple_heads', entity_id: 0, head_ids: [1, 2] },
		])
	})

	test('flags a head word that is not directly in its own kind of phrase', () => {
		const entities = [
			open_phrase({ category: 'Verb Phrase' }),
			word({ category: 'Verb', concept: concept({ stem: 'run', part_of_speech: 'Verb' }) }),
			word({ category: 'Noun', concept: concept({ stem: 'tree' }) }),
			close_phrase(),
		]
		expect(check_phrase_structure({ source_entities: structured(entities) })).toEqual([
			{ check: 'phrase_structure', reason: 'orphan_head_word', entity_id: 2, expected_phrase: 'Noun Phrase', parent_category: 'Verb Phrase' },
		])
	})

	test('flags a head word outside any phrase', () => {
		const entities = [open_clause(), word({ category: 'Noun', concept: concept({ stem: 'tree' }) }), close_clause()]
		expect(check_phrase_structure({ source_entities: structured(entities) })).toMatchObject([
			{ reason: 'orphan_head_word', parent_category: 'Clause' },
		])
	})

	describe('adjective phrase usage', () => {
		const adjective_phrase_in = ({ parent, usage }: { parent: 'Noun Phrase' | 'Clause' | 'Adjective Phrase'; usage: string }): PageSourceEntity[] => {
			const open_parent = parent === 'Clause' ? open_clause() : open_phrase({ category: parent })
			const close_parent = parent === 'Clause' ? close_clause() : close_phrase()
			const adjective = word({ category: 'Adjective', concept: concept({ stem: 'big', part_of_speech: 'Adjective' }) })
			return [open_parent, open_phrase({ category: 'Adjective Phrase', features: { Usage: usage } }), adjective, close_phrase(), close_parent]
		}
		const usage_issues = (entities: PageSourceEntity[]) =>
			check_phrase_structure({ source_entities: structured(entities) }).filter(({ reason }) => reason === 'adjective_usage_mismatch')

		test('accepts a usage feature matching the structure', () => {
			expect(usage_issues(adjective_phrase_in({ parent: 'Noun Phrase', usage: 'Attributive' }))).toEqual([])
			expect(usage_issues(adjective_phrase_in({ parent: 'Clause', usage: 'Predicative' }))).toEqual([])
		})

		test('flags an attributive feature on a phrase in a clause', () => {
			expect(usage_issues(adjective_phrase_in({ parent: 'Clause', usage: 'Attributive' }))).toEqual([
				{ check: 'phrase_structure', reason: 'adjective_usage_mismatch', entity_id: 1, usage_feature: 'Attributive', structural_usage: 'Predicative', parent_category: 'Clause' },
			])
		})

		test('flags a predicative feature on a phrase in a noun phrase', () => {
			expect(usage_issues(adjective_phrase_in({ parent: 'Noun Phrase', usage: 'Predicative' }))).toMatchObject([
				{ usage_feature: 'Predicative', structural_usage: 'Attributive' },
			])
		})

		test('leaves an unset feature to the unset feature check, and skips phrases inside adjective phrases', () => {
			expect(usage_issues(adjective_phrase_in({ parent: 'Clause', usage: '' }))).toEqual([])
			expect(usage_issues(adjective_phrase_in({ parent: 'Adjective Phrase', usage: 'Predicative' }))).toEqual([])
		})
	})

	test('does not require adpositions or conjunctions to be inside a phrase', () => {
		const entities = [
			open_clause(),
			word({ category: 'Adposition', concept: concept({ stem: 'because', part_of_speech: 'Adposition' }) }),
			word({ category: 'Conjunction', concept: concept({ stem: 'and', part_of_speech: 'Conjunction' }) }),
			close_clause(),
		]
		expect(issue_reasons(entities)).toEqual([])
	})
})

describe('validate_encoding alternate severity', () => {
	const result_for = ({ feature, values }: { feature: string; values: string[] }) => {
		const entities = structured(values.flatMap(value => clause_with({ [feature]: value })))
		return validate_encoding({ source_entities: entities, senses: {} })
	}
	const analysis = (values: string[]) => result_for({ feature: 'Alternative Analysis', values })

	test('is an error when the neighboring clause has no value for the feature', () => {
		const missing = analysis(['Literal Alternate'])
		expect(missing.errors).toHaveLength(1)
		expect(missing.warnings).toEqual([])

		const not_applicable = analysis(['Literal Alternate', 'Not Applicable'])
		expect(not_applicable.errors.map(issue => issue.check)).toEqual(['alternate'])
	})

	test('is an error when the neighbor belongs to a different kind of alternate sharing the feature', () => {
		const { errors, warnings } = analysis(['Literal Alternate', 'Biblical Units', 'Contemporary Units'])
		expect(errors).toMatchObject([{ check: 'alternate', value: 'Literal Alternate', severity: 'error' }])
		expect(warnings).toEqual([])
	})

	test('is a warning when the neighbor is another value of the same kind of alternate', () => {
		const { errors, warnings } = analysis(['Literal Alternate', 'Literal Alternate'])
		expect(errors.map(issue => issue.check)).toEqual(['alternate'])
		expect(warnings).toMatchObject([{ check: 'alternate', value: 'Literal Alternate', severity: 'warning' }])

		const numbered = analysis(['Primary Analysis', 'Second Alternative Analysis'])
		expect(numbered.errors).toEqual([])
		expect(numbered.warnings).toMatchObject([
			{ value: 'Primary Analysis', expected: { direction: 'after' } },
			{ value: 'Second Alternative Analysis', expected: { direction: 'before' } },
		])
	})

	test('treats every value of the vocabulary and rhetorical features as one kind of alternate', () => {
		const vocabulary = result_for({
			feature: 'Vocabulary Alternate',
			values: ['Single Sentence - Complex Vocabulary Alternate', 'Single Sentence - Complex Vocabulary Alternate'],
		})
		expect(vocabulary.warnings).toMatchObject([{ value: 'Single Sentence - Complex Vocabulary Alternate', severity: 'warning' }])

		const rhetorical = result_for({ feature: 'Rhetorical Question', values: ['Content Rhetorical Question', 'Not Applicable'] })
		expect(rhetorical.warnings).toEqual([])
		expect(rhetorical.errors).toHaveLength(1)
	})
})

describe('validate_encoding', () => {
	test('separates errors from warnings', () => {
		const entities = structured([
			...clause_with({ 'Alternative Analysis': 'Literal Alternate' }),
			...noun_phrase({ stem: 'tree', noun_list_index: '1' }),
			...noun_phrase({ stem: 'rock', noun_list_index: '1' }),
		])
		const { errors, warnings } = validate_encoding({ source_entities: entities, senses: {} })
		expect(errors.map(({ check }) => check)).toEqual(['alternate'])
		expect(warnings.map(({ check }) => check)).toEqual(['noun_list'])
	})
})
