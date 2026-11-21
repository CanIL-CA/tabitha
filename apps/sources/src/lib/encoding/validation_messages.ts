import type { ConceptKey } from '@tabitha/types'
import type { AlternateIssue, BracketIssue, CaseFrameIssue, ConceptLevelIssue, NounListIssue, PhraseStructureIssue, ValidationIssue } from './validation'
import type { PageSourceEntity } from '#lib/types.js'

type IssueTarget = {
	message: string
	entity_ids: number[]
}

export type DescribedIssue = IssueTarget & {
	show_label: string
	issue: ValidationIssue
}

type DescribeIssueOptions = {
	issue: ValidationIssue
	source_entities: PageSourceEntity[]
}

const describe_entity = (entity: PageSourceEntity | undefined): string => {
	return entity?.concept ? `${entity.category} '${describe_concept(entity.concept)}'` : entity?.category ?? 'Entity'
}

const describe_concept = ({ stem, sense }: ConceptKey): string => `${stem}-${sense}`

// Alternates are described with one sentence, so only the names change. Most names come from the value itself, with shared names
// for features where telling the values apart would not help the reader.
const SHARED_NAME_BY_FEATURE: Record<string, (value: string) => string> = {
	'Alternative Analysis': value => value.endsWith('Units') ? `${value.toLowerCase()} alternate` : value.toLowerCase(),
	'Vocabulary Alternate': value => value.includes('Complex') ? 'complex alternate' : 'simple alternate',
	'Rhetorical Question': value => value === 'Equivalent Statement' ? 'equivalent statement' : 'rhetorical question',
}

// The sentences of a complex or simple version expect each other in order, which the shared names would hide.
type AlternatePhrases = {
	name: string
	previous?: string
	next?: string
}

const ALTERNATE_PHRASES_BY_VALUE: Record<string, AlternatePhrases> = {
	'First Sentence - Complex Vocabulary Alternate': { name: 'first complex sentence', next: 'coordinate or last complex sentence' },
	'Coordinate Sentence - Complex Vocabulary Alternate': { name: 'coordinate complex sentence', previous: 'first or coordinate complex sentence', next: 'coordinate or last complex sentence' },
	'Last Sentence - Complex Vocabulary Alternate': { name: 'last complex sentence', previous: 'first or coordinate complex sentence' },
	'First Sentence - Simple Vocabulary Alternate': { name: 'first simple sentence', next: 'coordinate or last simple sentence' },
	'Coordinate Sentence - Simple Vocabulary Alternate': { name: 'coordinate simple sentence', previous: 'first or coordinate simple sentence', next: 'coordinate or last simple sentence' },
	'Last Sentence - Simple Vocabulary Alternate': { name: 'last simple sentence', previous: 'first or coordinate simple sentence' },
}

const with_article = (name: string): string => `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`

const capitalize = (text: string): string => `${text[0].toUpperCase()}${text.slice(1)}`

function get_shared_alternate_name({ feature_name, value }: { feature_name: string; value: string }): string {
	return SHARED_NAME_BY_FEATURE[feature_name]?.(value) ?? value.toLowerCase()
}

function describe_alternate({ feature_name, value, expected }: AlternateIssue): string {
	const phrases = ALTERNATE_PHRASES_BY_VALUE[value]
	const expected_names = new Set(expected.values.map(expected_value => get_shared_alternate_name({ feature_name, value: expected_value })))

	const subject = phrases?.name ?? get_shared_alternate_name({ feature_name, value })
	const expectation = phrases?.[expected.direction === 'before' ? 'previous' : 'next'] ?? [...expected_names].join(' or ')
	const position = expected.direction === 'before' ? 'preceded' : 'followed'

	return `${capitalize(with_article(subject))} should usually be ${position} by ${with_article(expectation)}, but none was found.`
}

function describe_bracket({ issue, entity }: { issue: BracketIssue; entity: PageSourceEntity }): string {
	switch (issue.reason) {
		case 'unclosed':
			return `${describe_entity(entity)} is opened with '${issue.bracket}' but never closed.`
		case 'unmatched':
			return `The closing '${issue.bracket}' has no matching opening bracket.`
		case 'mismatched':
			return `The closing '${issue.bracket}' does not match the '${issue.opened_with}' it closes.`
	}
}

function describe_noun_list(issue: NounListIssue): IssueTarget {
	switch (issue.reason) {
		case 'multiple_concepts':
			return { message: `Noun list index ${issue.noun_list_index} is assigned to more than one concept: ${issue.nouns.join(', ')}.`, entity_ids: issue.entity_ids }
		case 'unused_index':
			return { message: `Noun list index ${issue.noun_list_index} has no nouns assigned`, entity_ids: [] }
	}
}

function describe_phrase_structure({ issue, entity }: { issue: PhraseStructureIssue; entity: PageSourceEntity }): string {
	const label = describe_entity(entity)
	switch (issue.reason) {
		case 'phrase_without_head':
			return `${label} has no ${issue.head_category}.`
		case 'phrase_with_multiple_heads':
			return `${label} has ${issue.head_ids.length} ${issue.head_category} words, but should have one.`
		case 'orphan_head_word':
			return `${label} should be directly inside a ${issue.expected_phrase}.`
		case 'adjective_usage_mismatch':
			return `${label} is set to '${issue.usage_feature}', but its position makes it ${issue.structural_usage}.`
	}
}

function describe_concept_level(issue: ConceptLevelIssue): string {
	const concept = `${describe_concept(issue.concept)} (level ${issue.level})`
	switch (issue.reason) {
		case 'complex_outside_complex_context':
			return `${issue.concept.part_of_speech} ${concept} is a complex concept, but it is not in a complex pairing or complex vocabulary alternate.`
		case 'concept_not_simple':
			return `${issue.concept.part_of_speech} ${concept} is paired as the simple concept, but it should be level 0 or 1.`
		case 'pairing_concept_not_complex':
			return `${issue.concept.part_of_speech} ${concept} is paired as the complex concept, but it should be level 2 or 3.`
	}
}

function describe_case_frame(issue: CaseFrameIssue): string {
	const label = `${issue.category} ${describe_concept(issue.concept)}`
	switch (issue.reason) {
		case 'no_categories': {
			const categories_label = issue.category === 'Verb' ? 'theta grid' : 'usage'
			return `${label} has no ${categories_label} info in the ontology.`
		}
		case 'frame_mismatch': {
			const differences = [
				issue.missing_required.length ? `missing ${issue.missing_required.join(', ')}` : '',
				issue.unexpected.length ? `unexpected ${issue.unexpected.join(', ')}` : '',
			].filter(difference => difference !== '')
			const categories_label = issue.category === 'Verb' ? 'case frame' : 'usage'
			return `${label} does not match its saved ${categories_label}: ${differences.join('; ')}.`
		}
	}
}

function describe_issue_target({ issue, source_entities }: DescribeIssueOptions): IssueTarget {
	switch (issue.check) {
		case 'alternate':
			return { message: describe_alternate(issue), entity_ids: [issue.entity_id] }
		case 'bracket': {
			const entity = source_entities[issue.entity_id]
			return { message: describe_bracket({ issue, entity }), entity_ids: [issue.entity_id] }
		}
		case 'unset_feature': {
			const entity = source_entities[issue.entity_id]
			return { message: `${describe_entity(entity)} has unset features: ${issue.feature_names.join(', ')}.`, entity_ids: [issue.entity_id] }
		}
		case 'phrase_structure': {
			const entity = source_entities[issue.entity_id]
			return { message: describe_phrase_structure({ issue, entity }), entity_ids: [issue.entity_id] }
		}
		case 'noun_list':
			return describe_noun_list(issue)
		case 'concept_level':
			return { message: describe_concept_level(issue), entity_ids: [issue.entity_id] }
		case 'case_frame':
			return { message: describe_case_frame(issue), entity_ids: issue.reason === 'no_categories' ? issue.entity_ids : [issue.entity_id] }
	}
}

function build_show_label({ entity_ids, source_entities }: { entity_ids: number[]; source_entities: PageSourceEntity[] }): string {
	const category = source_entities[entity_ids[0]]?.category
	if (!category) return 'Show'

	return entity_ids.length > 1 ? `Show ${category}s` : `Show ${category}`
}

export function describe_issue({ issue, source_entities }: DescribeIssueOptions): DescribedIssue {
	const target = describe_issue_target({ issue, source_entities })
	return { ...target, show_label: build_show_label({ entity_ids: target.entity_ids, source_entities }), issue }
}
