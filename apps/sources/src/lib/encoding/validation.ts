import { is_boundary_end, is_boundary_start } from './entity_filters'
import { is_used_in_source } from './features'
import { build_noun_list_rows } from '#lib/data/noun_list.js'
import { find_sense, type SensesByConcept } from '#lib/data/ontology_senses.js'
import type { ConceptKey, SourceEntityCategory } from '@tabitha/types'
import type { PageSourceEntity } from '#lib/types.js'

//===============
// Result types

export type ValidationSeverity = 'error' | 'warning'

type EntityRef = { entity_id: number }

// The severity is a warning when the neighboring clause has another value from the same group of alternates as `value`, and an error otherwise.
export type AlternateIssue = EntityRef & {
	check: 'alternate'
	severity: ValidationSeverity
	feature_name: string
	value: string
	expected: { direction: 'before' | 'after'; values: string[] }
}

export type MultipleConceptsIssue = {
	check: 'noun_list'
	reason: 'multiple_concepts'
	noun_list_index: string
	entity_ids: number[]
	nouns: string[]
}

export type UnusedIndexIssue = {
	check: 'noun_list'
	reason: 'unused_index'
	noun_list_index: string
}

export type NounListIssue = MultipleConceptsIssue | UnusedIndexIssue

export type ConceptLevelReason = 'complex_outside_complex_context' | 'concept_not_simple' | 'pairing_concept_not_complex'

export type ConceptLevelIssue = EntityRef & {
	check: 'concept_level'
	concept: ConceptKey
	level: number
	reason: ConceptLevelReason
}

// `concept` is the concept the issue is about, which is the pairing concept when the word has a pairing and that is the one with the problem.
type CaseFrameBase = {
	check: 'case_frame'
	category: SourceEntityCategory
	concept: ConceptKey
}

// For verbs `present` holds theta grid arguments, for other words it holds usages like 'modify_noun_phrase'.
export type CaseFrameMismatchIssue = CaseFrameBase & EntityRef & {
	reason: 'frame_mismatch'
	present: string[]
	current_categories: string[]
	missing_required: string[]
	unexpected: string[]
}

// Reported once for a concept, with every entity that uses it, since the missing categories are the same for all of them.
export type NoCategoriesIssue = CaseFrameBase & {
	reason: 'no_categories'
	entity_ids: number[]
}

export type CaseFrameIssue = CaseFrameMismatchIssue | NoCategoriesIssue

export type PhraseHeadIssue = EntityRef & {
	check: 'phrase_structure'
	reason: 'phrase_without_head' | 'phrase_with_multiple_heads'
	head_category: SourceEntityCategory
	head_ids: number[]
}

export type OrphanHeadWordIssue = EntityRef & {
	check: 'phrase_structure'
	reason: 'orphan_head_word'
	expected_phrase: SourceEntityCategory
	parent_category: SourceEntityCategory
}

export type AdjectivePhraseUsageIssue = EntityRef & {
	check: 'phrase_structure'
	reason: 'adjective_usage_mismatch'
	usage_feature: string
	structural_usage: string
	parent_category: SourceEntityCategory
}

export type PhraseStructureIssue = PhraseHeadIssue | OrphanHeadWordIssue | AdjectivePhraseUsageIssue

export type UnsetFeatureIssue = EntityRef & {
	check: 'unset_feature'
	feature_names: string[]
}

export type ValidationIssue = AlternateIssue | NounListIssue | ConceptLevelIssue | CaseFrameIssue | PhraseStructureIssue | UnsetFeatureIssue

export type ValidationResult = {
	errors: ValidationIssue[]
	warnings: ValidationIssue[]
}

const SEVERITY_BY_CHECK: Record<Exclude<ValidationIssue['check'], 'alternate'>, ValidationSeverity> = {
	unset_feature: 'error',
	phrase_structure: 'error',
	noun_list: 'warning',
	concept_level: 'warning',
	case_frame: 'warning',
}

type ValidateEncodingOptions = {
	source_entities: PageSourceEntity[]
	senses: SensesByConcept
}

export function validate_encoding({ source_entities, senses }: ValidateEncodingOptions): ValidationResult {
	const issues: ValidationIssue[] = [
		...check_alternates({ source_entities }),
		...check_unset_features({ source_entities }),
		...check_phrase_structure({ source_entities }),
		...check_noun_list({ source_entities }),
		...check_concept_level({ source_entities, senses }),
		...check_case_frames({ source_entities, senses }),
	]

	return {
		errors: issues.filter(issue => get_severity(issue) === 'error'),
		warnings: issues.filter(issue => get_severity(issue) === 'warning'),
	}
}

function get_severity(issue: ValidationIssue): ValidationSeverity {
	return issue.check === 'alternate' ? issue.severity : SEVERITY_BY_CHECK[issue.check]
}

//===============
// Shared helpers

function get_feature_value({ entity, feature_name }: { entity: PageSourceEntity; feature_name: string }): string {
	return entity.features.find(({ name }) => name === feature_name)?.value ?? ''
}

function is_clause_start(entity: PageSourceEntity): boolean {
	return entity.category === 'Clause' && is_boundary_start(entity)
}

//===============
// Alternates

type AlternateRule = {
	previous?: string[]
	next?: string[]
}

const RHETORICAL_QUESTIONS = [
	'Content Rhetorical Question',
	"Accusatory Yes-No Question Expects 'Yes'",
	"Emphatic Yes-No Question Expects 'Yes'",
	"Instructional Yes-No Question Expects 'Yes'",
	"Reflective Yes-No Question Expects 'Yes'",
	"Assertive Yes-No Question Expects 'Yes'",
	"Persuasive Yes-No Question Expects 'Yes'",
	"Yes-No Question Expects 'No'",
]

const RHETORICAL_QUESTION_RULES: Record<string, AlternateRule> = {
	...Object.fromEntries(RHETORICAL_QUESTIONS.map(value => [value, { next: ['Equivalent Statement'] }])),
	'Equivalent Statement': { previous: RHETORICAL_QUESTIONS },
}

const ALTERNATIVE_ANALYSIS_RULES: Record<string, AlternateRule> = {
	'Primary Analysis': { next: ['First Alternative Analysis'] },
	'First Alternative Analysis': { previous: ['Primary Analysis'] },
	'Second Alternative Analysis': { previous: ['First Alternative Analysis'] },
	'Third Alternative Analysis': { previous: ['Second Alternative Analysis'] },
	'Fourth Alternative Analysis': { previous: ['Third Alternative Analysis'] },
	'Fifth Alternative Analysis': { previous: ['Fourth Alternative Analysis'] },
	'Literal Alternate': { next: ['Dynamic Alternate'] },
	'Dynamic Alternate': { previous: ['Literal Alternate'] },
	'Biblical Units': { next: ['Contemporary Units'] },
	'Contemporary Units': { previous: ['Biblical Units'] },
}

// A complex version comes first, then its simple version. Each version is either a Single sentence or a sequence of First, Coordinate and Last sentences.
// The number of simple clauses is unrelated to the number of complex ones, so a complex version can be followed by either kind of simple version.
const COMPLEX_SINGLE = 'Single Sentence - Complex Vocabulary Alternate'
const COMPLEX_FIRST = 'First Sentence - Complex Vocabulary Alternate'
const COMPLEX_COORDINATE = 'Coordinate Sentence - Complex Vocabulary Alternate'
const COMPLEX_LAST = 'Last Sentence - Complex Vocabulary Alternate'
const SIMPLE_SINGLE = 'Single Sentence - Simple Vocabulary Alternate'
const SIMPLE_FIRST = 'First Sentence - Simple Vocabulary Alternate'
const SIMPLE_COORDINATE = 'Coordinate Sentence - Simple Vocabulary Alternate'
const SIMPLE_LAST = 'Last Sentence - Simple Vocabulary Alternate'

const COMPLEX_VERSION_ENDINGS = [COMPLEX_SINGLE, COMPLEX_LAST]
const SIMPLE_VERSION_STARTS = [SIMPLE_SINGLE, SIMPLE_FIRST]

const VOCABULARY_ALTERNATE_RULES: Record<string, AlternateRule> = {
	[COMPLEX_SINGLE]: { next: SIMPLE_VERSION_STARTS },
	[COMPLEX_FIRST]: { next: [COMPLEX_COORDINATE, COMPLEX_LAST] },
	[COMPLEX_COORDINATE]: { previous: [COMPLEX_FIRST, COMPLEX_COORDINATE], next: [COMPLEX_COORDINATE, COMPLEX_LAST] },
	[COMPLEX_LAST]: { previous: [COMPLEX_FIRST, COMPLEX_COORDINATE], next: SIMPLE_VERSION_STARTS },
	[SIMPLE_SINGLE]: { previous: COMPLEX_VERSION_ENDINGS },
	[SIMPLE_FIRST]: { previous: COMPLEX_VERSION_ENDINGS, next: [SIMPLE_COORDINATE, SIMPLE_LAST] },
	[SIMPLE_COORDINATE]: { previous: [SIMPLE_FIRST, SIMPLE_COORDINATE], next: [SIMPLE_COORDINATE, SIMPLE_LAST] },
	[SIMPLE_LAST]: { previous: [SIMPLE_FIRST, SIMPLE_COORDINATE] },
}

// Values that belong together. A feature can hold several groups, since 'Alternative Analysis' is shared by unrelated kinds of alternates.
const ALTERNATE_GROUPS_BY_FEATURE: Record<string, string[][]> = {
	'Alternative Analysis': [
		['Primary Analysis', 'First Alternative Analysis', 'Second Alternative Analysis', 'Third Alternative Analysis', 'Fourth Alternative Analysis', 'Fifth Alternative Analysis'],
		['Literal Alternate', 'Dynamic Alternate'],
		['Biblical Units', 'Contemporary Units'],
	],
	'Vocabulary Alternate': [[COMPLEX_SINGLE, COMPLEX_FIRST, COMPLEX_COORDINATE, COMPLEX_LAST, SIMPLE_SINGLE, SIMPLE_FIRST, SIMPLE_COORDINATE, SIMPLE_LAST]],
	'Rhetorical Question': [[...RHETORICAL_QUESTIONS, 'Equivalent Statement']],
}

const ALTERNATE_RULES_BY_FEATURE: Record<string, Record<string, AlternateRule>> = {
	'Alternative Analysis': ALTERNATIVE_ANALYSIS_RULES,
	'Vocabulary Alternate': VOCABULARY_ALTERNATE_RULES,
	'Rhetorical Question': RHETORICAL_QUESTION_RULES,
}

type ClauseOptions = {
	source_entities: PageSourceEntity[]
	clause: PageSourceEntity
}

function find_next_sibling_clause({ source_entities, clause }: ClauseOptions): PageSourceEntity | undefined {
	const end_id = source_entities.findIndex(entity => is_boundary_end(entity) && entity.parent_id === clause.id)
	if (end_id < 0) return undefined

	const candidate = source_entities[end_id + 1]
	if (!candidate) return undefined
	if (!is_clause_start(candidate)) return undefined

	return candidate.parent_id === clause.parent_id ? candidate : undefined
}

function find_previous_sibling_clause({ source_entities, clause }: ClauseOptions): PageSourceEntity | undefined {
	const candidate = source_entities[clause.id - 1]
	if (!candidate) return undefined
	if (!is_boundary_end(candidate)) return undefined

	const opener = source_entities[candidate.parent_id]
	if (!opener) return undefined
	if (!is_clause_start(opener)) return undefined

	return opener.parent_id === clause.parent_id ? opener : undefined
}

function find_clause_alternate_issues({ source_entities, clause }: ClauseOptions): AlternateIssue[] {
	const next = find_next_sibling_clause({ source_entities, clause })
	const previous = find_previous_sibling_clause({ source_entities, clause })

	return Object.entries(ALTERNATE_RULES_BY_FEATURE).flatMap(([feature_name, rules_by_value]) => {
		const value = get_feature_value({ entity: clause, feature_name })
		const { previous: expected_previous, next: expected_next } = rules_by_value[value] ?? {}

		const neighbor_value = (neighbor: PageSourceEntity | undefined) =>
			neighbor ? get_feature_value({ entity: neighbor, feature_name }) : ''

		const is_in_same_group = (neighbor_value: string) =>
			ALTERNATE_GROUPS_BY_FEATURE[feature_name].some(group => group.includes(value) && group.includes(neighbor_value))

		const issues: AlternateIssue[] = []
		const previous_value = neighbor_value(previous)
		if (expected_previous && !expected_previous.includes(previous_value)) {
			issues.push({
				check: 'alternate',
				severity: is_in_same_group(previous_value) ? 'warning' : 'error',
				entity_id: clause.id,
				feature_name,
				value,
				expected: { direction: 'before', values: expected_previous },
			})
		}
		const next_value = neighbor_value(next)
		if (expected_next && !expected_next.includes(next_value)) {
			issues.push({
				check: 'alternate',
				severity: is_in_same_group(next_value) ? 'warning' : 'error',
				entity_id: clause.id,
				feature_name,
				value,
				expected: { direction: 'after', values: expected_next },
			})
		}
		return issues
	})
}

export function check_alternates({ source_entities }: { source_entities: PageSourceEntity[] }): AlternateIssue[] {
	return source_entities
		.filter(is_clause_start)
		.flatMap(clause => find_clause_alternate_issues({ source_entities, clause }))
}

//===============
// Noun list

export function check_noun_list({ source_entities }: { source_entities: PageSourceEntity[] }): NounListIssue[] {
	return build_noun_list_rows({ source_entities }).flatMap(({ index, noun, entity_ids }): NounListIssue[] => {
		if (!entity_ids.length) return [{ check: 'noun_list', reason: 'unused_index', noun_list_index: index }]

		const nouns = noun.split(', ')
		return nouns.length > 1 ? [{ check: 'noun_list', reason: 'multiple_concepts', noun_list_index: index, entity_ids, nouns }] : []
	})
}

//===============
// Concept level

const SIMPLE_LEVELS = new Set<number>([0, 1, 4])
const COMPLEX_LEVELS = new Set<number>([2, 3])

type LevelExpectation = {
	concept: ConceptKey
	allowed_levels: Set<number>
	reason: ConceptLevelReason
}

function get_concept_level({ senses, concept }: { senses: SensesByConcept; concept: ConceptKey }): number | undefined {
	const { level } = find_sense({ senses, concept })
	return level === '' ? undefined : Number(level)
}

function is_in_complex_alternate({ source_entities, entity }: { source_entities: PageSourceEntity[]; entity: PageSourceEntity }): boolean {
	const ancestor = source_entities[entity.parent_id]
	if (!ancestor) return false

	const is_complex = get_feature_value({ entity: ancestor, feature_name: 'Vocabulary Alternate' }).includes('Complex')
	return is_complex || is_in_complex_alternate({ source_entities, entity: ancestor })
}

function find_level_expectations({ source_entities, entity }: { source_entities: PageSourceEntity[]; entity: PageSourceEntity }): LevelExpectation[] {
	const { concept, pairing_concept, pairing_type } = entity
	if (!concept) return []

	if (pairing_type === 'simple-complex' && pairing_concept) {
		return [
			{ concept, allowed_levels: SIMPLE_LEVELS, reason: 'concept_not_simple' },
			{ concept: pairing_concept, allowed_levels: COMPLEX_LEVELS, reason: 'pairing_concept_not_complex' },
		]
	}
	if (pairing_type) return []
	if (is_in_complex_alternate({ source_entities, entity })) return []

	return [{ concept, allowed_levels: SIMPLE_LEVELS, reason: 'complex_outside_complex_context' }]
}

export function check_concept_level({ source_entities, senses }: ValidateEncodingOptions): ConceptLevelIssue[] {
	return source_entities.flatMap(entity =>
		find_level_expectations({ source_entities, entity }).flatMap(({ concept, allowed_levels, reason }) => {
			const level = get_concept_level({ senses, concept })
			if (level === undefined || allowed_levels.has(level)) return []

			return [{ check: 'concept_level' as const, entity_id: entity.id, concept, level, reason }]
		}),
	)
}

//===============
// Case frames

type ArgumentRoleLookup = {
	feature_name: string
	roles: Record<string, string>
}

// Maps the feature value of an argument to the theta grid role names the ontology uses for a verb's categories.
const ARGUMENT_ROLE_LOOKUP_BY_CATEGORY: Record<string, ArgumentRoleLookup> = {
	'Noun Phrase': {
		feature_name: 'Semantic Role',
		roles: {
			'Most Agent-like': 'Agent-like',
			'Most Patient-like': 'Patient-like',
			'State': 'State',
			'Source': 'Source',
			'Destination': 'Destination',
			'Instrument': 'Instrument',
			'Beneficiary': 'Beneficiary',
		},
	},
	'Clause': {
		feature_name: 'Type',
		roles: {
			'Agent (Subject Complement)': 'Agent proposition',
			'Patient (Object Complement)': 'Patient proposition',
		},
	},
}

const OPTIONAL_CATEGORY = /^\((.*)\)$/

function get_argument_role(entity: PageSourceEntity): string | undefined {
	const lookup = ARGUMENT_ROLE_LOOKUP_BY_CATEGORY[entity.category]
	if (!lookup) return undefined

	return lookup.roles[get_feature_value({ entity, feature_name: lookup.feature_name })]
}

function find_enclosing_clause({ source_entities, entity }: { source_entities: PageSourceEntity[]; entity: PageSourceEntity }): PageSourceEntity | undefined {
	const parent = source_entities[entity.parent_id]
	if (!parent) return undefined

	return parent.category === 'Clause' ? parent : find_enclosing_clause({ source_entities, entity: parent })
}

function find_children({ source_entities, parent }: { source_entities: PageSourceEntity[]; parent: PageSourceEntity }): PageSourceEntity[] {
	return source_entities.filter(entity => entity.parent_id === parent.id && !is_boundary_end(entity))
}

function find_present_arguments({ source_entities, clause }: ClauseOptions): string[] {
	const roles = find_children({ source_entities, parent: clause })
		.filter(is_boundary_start)
		.map(get_argument_role)
		.filter(role => role !== undefined)
	return [...new Set(roles)]
}

// What a word is compared against: the usages or arguments actually present, those the ontology requires, and those it allows.
type CaseFrameProfile = {
	present: string[]
	required: string[]
	allowed: Set<string>
}

type ProfileOptions = {
	source_entities: PageSourceEntity[]
	word: PageSourceEntity
	categories: string[]
}

function build_verb_profile({ source_entities, word, categories }: ProfileOptions): CaseFrameProfile | undefined {
	const clause = find_enclosing_clause({ source_entities, entity: word })
	if (!clause) return undefined

	const current_categories = categories.filter(category => category !== '')
	return {
		present: find_present_arguments({ source_entities, clause }),
		required: current_categories.filter(category => !OPTIONAL_CATEGORY.test(category)),
		allowed: new Set(current_categories.map(category => category.replace(OPTIONAL_CATEGORY, '$1'))),
	}
}

// The ontology encodes a usage as 'always used ...', 'sometimes used ...' or 'never used ...', in a fixed position for each usage.
type UsageProfile = {
	category_offset: number
	usages: string[]
	detect_usages: (options: Omit<ProfileOptions, 'categories'>) => string[] | undefined
}

function get_ancestor_categories({ source_entities, word }: { source_entities: PageSourceEntity[]; word: PageSourceEntity }): [string, string] {
	const parent = source_entities[word.parent_id]
	const grandparent = parent ? source_entities[parent.parent_id] : undefined
	return [parent?.category ?? '', grandparent?.category ?? '']
}

type UsageByContext = Record<string, string>

// A context is the word's parent category, optionally followed by its grandparent's: 'Noun Phrase > Clause'.
function detect_usage_by_context({ source_entities, word, usage_by_context }: { source_entities: PageSourceEntity[]; word: PageSourceEntity; usage_by_context: UsageByContext }): string[] | undefined {
	const [parent, grandparent] = get_ancestor_categories({ source_entities, word })
	const usage = usage_by_context[parent] ?? usage_by_context[`${parent} > ${grandparent}`]
	return usage ? [usage] : undefined
}

const CONJUNCTION_USAGE_BY_CONTEXT: UsageByContext = {
	'Clause': 'conjoin_clauses',
	'Noun Phrase': 'conjoin_noun_phrases',
	'Adjective Phrase': 'conjoin_adjective_phrases',
	'Adverb Phrase': 'conjoin_adverb_phrases',
}

const ADVERB_USAGE_BY_CONTEXT: UsageByContext = {
	'Adverb Phrase > Clause': 'modify_verb_in_clause',
	'Adverb Phrase > Noun Phrase': 'modify_noun_phrase',
	'Adverb Phrase > Adjective Phrase': 'modify_adjective_phrase',
}

const ADPOSITION_USAGE_BY_CONTEXT: UsageByContext = {
	'Noun Phrase > Clause': 'adjunct_phrase',
	'Noun Phrase > Noun Phrase': 'noun_noun_phrase',
	'Clause': 'adverbial_clause',
}

const COMPARATIVE_DEGREES = new Set(['Comparative', 'Intensified Comparative'])
const MOST_AGENT_LIKE = 'Most Agent-like'

// Participants are identified by noun list index, since the index is what links mentions of the same participant. A noun without one falls back to its concept.
function find_agent_identities({ source_entities, clause }: ClauseOptions): Set<string> {
	const agent_identities = find_children({ source_entities, parent: clause })
		.filter(entity => entity.category === 'Noun Phrase' && get_feature_value({ entity, feature_name: 'Semantic Role' }) === MOST_AGENT_LIKE)
		.flatMap(phrase => find_children({ source_entities, parent: phrase }).filter(({ category }) => category === 'Noun'))
		.map(({ noun_list_index, concept }) => noun_list_index ?? (concept ? `${concept.stem}-${concept.sense}` : ''))
		.filter(identity => identity !== '')
	return new Set(agent_identities)
}

function is_same_participant({ source_entities, outer_clause, inner_clause }: { source_entities: PageSourceEntity[]; outer_clause: PageSourceEntity; inner_clause: PageSourceEntity }): boolean {
	const outer_agents = find_agent_identities({ source_entities, clause: outer_clause })
	const inner_agents = find_agent_identities({ source_entities, clause: inner_clause })

	return outer_agents.size > 0
		&& outer_agents.size === inner_agents.size
		&& [...outer_agents].every(agent => inner_agents.has(agent))
}

function detect_predicative_usages({ source_entities, phrase }: { source_entities: PageSourceEntity[]; phrase: PageSourceEntity }): string[] {
	const outer_clause = find_enclosing_clause({ source_entities, entity: phrase })
	const argument_usages = find_children({ source_entities, parent: phrase })
		.filter(is_boundary_start)
		.flatMap(argument => {
			if (argument.category === 'Noun Phrase') return ['predicative_with_nominal_argument']
			if (argument.category !== 'Clause') return []
			if (!outer_clause) return []

			const is_same = is_same_participant({ source_entities, outer_clause, inner_clause: argument })
			return [is_same ? 'predicative_with_same_participant_clause' : 'predicative_with_different_participant_clause']
		})

	return argument_usages.length ? [...new Set(argument_usages)] : ['predicative_without_argument']
}

const ADJECTIVE_PHRASE_USAGE_DETECTORS: Record<string, (options: { source_entities: PageSourceEntity[]; phrase: PageSourceEntity }) => string[]> = {
	Attributive: () => ['attributive'],
	Predicative: detect_predicative_usages,
}

// The usage is read from the structure, not the Usage feature. An adjective phrase within another adjective phrase is ambiguous, so it has no structural usage.
const ADJECTIVE_PHRASE_USAGE_BY_PARENT: Record<string, string> = {
	'Noun Phrase': 'Attributive',
	'Clause': 'Predicative',
}

function find_structural_adjective_phrase_usage({ source_entities, phrase }: { source_entities: PageSourceEntity[]; phrase: PageSourceEntity }): string | undefined {
	return ADJECTIVE_PHRASE_USAGE_BY_PARENT[source_entities[phrase.parent_id]?.category ?? '']
}

function detect_adjective_usages({ source_entities, word }: Omit<ProfileOptions, 'categories'>): string[] | undefined {
	const phrase = source_entities[word.parent_id]
	if (phrase?.category !== 'Adjective Phrase') return undefined

	const phrase_usage = find_structural_adjective_phrase_usage({ source_entities, phrase })
	if (!phrase_usage) return undefined

	const detect_phrase_usages = ADJECTIVE_PHRASE_USAGE_DETECTORS[phrase_usage]

	const is_comparative = COMPARATIVE_DEGREES.has(get_feature_value({ entity: word, feature_name: 'Degree' }))
	return [...detect_phrase_usages({ source_entities, phrase }), ...is_comparative ? ['comparative'] : []]
}

// The ontology's Adjective categories start with the semantic category, so the usages begin at position 1.
const USAGE_PROFILE_BY_CATEGORY: Record<string, UsageProfile> = {
	Adjective: {
		category_offset: 1,
		usages: ['attributive', 'predicative_without_argument', 'predicative_with_nominal_argument', 'predicative_with_same_participant_clause', 'predicative_with_different_participant_clause', 'comparative'],
		detect_usages: detect_adjective_usages,
	},
	Adposition: {
		category_offset: 0,
		usages: ['adjunct_phrase', 'noun_noun_phrase', 'adverbial_clause'],
		detect_usages: options => detect_usage_by_context({ ...options, usage_by_context: ADPOSITION_USAGE_BY_CONTEXT }),
	},
	Adverb: {
		category_offset: 0,
		usages: ['modify_verb_in_clause', 'modify_noun_phrase', 'modify_adjective_phrase'],
		detect_usages: options => detect_usage_by_context({ ...options, usage_by_context: ADVERB_USAGE_BY_CONTEXT }),
	},
	Conjunction: {
		category_offset: 0,
		usages: ['conjoin_clauses', 'conjoin_noun_phrases', 'conjoin_adjective_phrases', 'conjoin_adverb_phrases'],
		detect_usages: options => detect_usage_by_context({ ...options, usage_by_context: CONJUNCTION_USAGE_BY_CONTEXT }),
	},
}

function get_usage_frequency(category: string | undefined): string {
	return category?.split(' ')[0] ?? ''
}

function build_usage_profile({ source_entities, word, categories }: ProfileOptions): CaseFrameProfile | undefined {
	const { category_offset, usages, detect_usages } = USAGE_PROFILE_BY_CATEGORY[word.category]
	const present = detect_usages({ source_entities, word })
	if (!present) return undefined

	const frequencies = usages.map((usage, i) => ({ usage, frequency: get_usage_frequency(categories[category_offset + i]) }))
	return {
		present,
		required: frequencies.filter(({ frequency }) => frequency === 'always').map(({ usage }) => usage),
		allowed: new Set(frequencies.filter(({ frequency }) => frequency !== 'never').map(({ usage }) => usage)),
	}
}

const CASE_FRAME_PROFILE_BUILDERS: Record<string, (options: ProfileOptions) => CaseFrameProfile | undefined> = {
	Verb: build_verb_profile,
	Adjective: build_usage_profile,
	Adposition: build_usage_profile,
	Adverb: build_usage_profile,
	Conjunction: build_usage_profile,
}

type WordConcept = {
	word: PageSourceEntity
	concept: ConceptKey
	categories: string[]
	build_profile: (options: ProfileOptions) => CaseFrameProfile | undefined
}

// A word with a pairing has two concepts, each with its own categories, but both sit in the same place in the structure.
function find_word_concepts({ senses, word }: { senses: SensesByConcept; word: PageSourceEntity }): WordConcept[] {
	const build_profile = CASE_FRAME_PROFILE_BUILDERS[word.category]
	if (!build_profile) return []

	return [word.concept, word.pairing_concept]
		.filter(concept => concept !== null)
		// Subgroup has a unique usage that there is no current category for, so it is intentionally blank. Because of its ubiquity, let's skip it for now.
		.filter(({ stem }) => stem !== '-Subgroup')
		.map(concept => ({ word, concept, categories: find_sense({ senses, concept }).categories, build_profile }))
}

function has_categories({ categories }: WordConcept): boolean {
	return categories.some(category => category !== '')
}

function find_frame_mismatch({ source_entities, word_concept }: { source_entities: PageSourceEntity[]; word_concept: WordConcept }): CaseFrameMismatchIssue[] {
	const { word, concept, categories, build_profile } = word_concept
	const profile = build_profile({ source_entities, word, categories })
	if (!profile) return []

	const { present, required, allowed } = profile
	const missing_required = required.filter(name => !present.includes(name))
	const unexpected = present.filter(name => !allowed.has(name))
	if (!missing_required.length && !unexpected.length) return []

	const current_categories = categories.filter(category => category !== '')
	return [{ check: 'case_frame', reason: 'frame_mismatch', entity_id: word.id, category: word.category, concept, present, current_categories, missing_required, unexpected }]
}

function find_missing_categories_issues(word_concepts: WordConcept[]): NoCategoriesIssue[] {
	const word_concepts_by_concept = Map.groupBy(word_concepts, ({ concept }) => `${concept.stem}|${concept.sense}|${concept.part_of_speech}`)

	return [...word_concepts_by_concept.values()].map(group => ({
		check: 'case_frame',
		reason: 'no_categories',
		category: group[0].word.category,
		concept: group[0].concept,
		entity_ids: [...new Set(group.map(({ word }) => word.id))],
	}))
}

export function check_case_frames({ source_entities, senses }: ValidateEncodingOptions): CaseFrameIssue[] {
	const word_concepts = source_entities.flatMap(word => find_word_concepts({ senses, word }))

	return [
		...find_missing_categories_issues(word_concepts.filter(word_concept => !has_categories(word_concept))),
		...word_concepts.filter(has_categories).flatMap(word_concept => find_frame_mismatch({ source_entities, word_concept })),
	]
}

//===============
// Phrase structure

// Only these four word categories head a phrase. Adpositions, conjunctions, particles and phrasals are legitimately found directly in clauses and phrases.
const HEAD_CATEGORY_BY_PHRASE: Record<string, SourceEntityCategory> = {
	'Noun Phrase': 'Noun',
	'Verb Phrase': 'Verb',
	'Adjective Phrase': 'Adjective',
	'Adverb Phrase': 'Adverb',
}

const PHRASE_BY_HEAD_CATEGORY: Record<string, SourceEntityCategory> = {
	'Noun': 'Noun Phrase',
	'Verb': 'Verb Phrase',
	'Adjective': 'Adjective Phrase',
	'Adverb': 'Adverb Phrase',
}

function find_phrase_head_issues({ source_entities, phrase }: { source_entities: PageSourceEntity[]; phrase: PageSourceEntity }): PhraseStructureIssue[] {
	const head_category = HEAD_CATEGORY_BY_PHRASE[phrase.category]
	const head_ids = find_children({ source_entities, parent: phrase })
		.filter(({ category }) => category === head_category)
		.map(({ id }) => id)

	const reason = head_ids.length === 0 ? 'phrase_without_head' : 'phrase_with_multiple_heads'
	return head_ids.length === 1 ? [] : [{ check: 'phrase_structure', reason, entity_id: phrase.id, head_category, head_ids }]
}

function find_orphan_head_issues({ source_entities, word }: { source_entities: PageSourceEntity[]; word: PageSourceEntity }): PhraseStructureIssue[] {
	const expected_phrase = PHRASE_BY_HEAD_CATEGORY[word.category]
	if (!expected_phrase) return []

	const parent_category = source_entities[word.parent_id]?.category ?? ''
	return parent_category === expected_phrase
		? []
		: [{ check: 'phrase_structure', reason: 'orphan_head_word', entity_id: word.id, expected_phrase, parent_category }]
}

// An unset Usage is left to check_unset_features.
function find_adjective_usage_issues({ source_entities, phrase }: { source_entities: PageSourceEntity[]; phrase: PageSourceEntity }): PhraseStructureIssue[] {
	const structural_usage = find_structural_adjective_phrase_usage({ source_entities, phrase })
	const usage_feature = get_feature_value({ entity: phrase, feature_name: 'Usage' })
	if (!structural_usage || usage_feature === '' || usage_feature === structural_usage) return []

	const parent_category = source_entities[phrase.parent_id]?.category ?? ''
	return [{ check: 'phrase_structure', reason: 'adjective_usage_mismatch', entity_id: phrase.id, usage_feature, structural_usage, parent_category }]
}

export function check_phrase_structure({ source_entities }: { source_entities: PageSourceEntity[] }): PhraseStructureIssue[] {
	const phrases = source_entities.filter(entity => is_boundary_start(entity) && entity.category in HEAD_CATEGORY_BY_PHRASE)
	const adjective_phrases = phrases.filter(({ category }) => category === 'Adjective Phrase')

	return [
		...phrases.flatMap(phrase => find_phrase_head_issues({ source_entities, phrase })),
		...source_entities.flatMap(word => find_orphan_head_issues({ source_entities, word })),
		...adjective_phrases.flatMap(phrase => find_adjective_usage_issues({ source_entities, phrase })),
	]
}

//===============
// Unset features

export function check_unset_features({ source_entities }: { source_entities: PageSourceEntity[] }): UnsetFeatureIssue[] {
	return source_entities.flatMap(({ id, category, features }) => {
		const feature_names = features
			.filter(feature => feature.value === '' && is_used_in_source(category)(feature))
			.map(({ name }) => name)
		return feature_names.length ? [{ check: 'unset_feature' as const, entity_id: id, feature_names }] : []
	})
}
