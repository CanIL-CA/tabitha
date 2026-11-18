import type { ConceptKey } from '@tabitha/types'
import type { AlternateIssue, CaseFrameIssue, ConceptLevelIssue, NounListIssue, PhraseStructureIssue, ValidationIssue } from './validation'
import type { PageSourceEntity } from '#lib/types.js'

type IssueTarget = {
	message: string
	entity_ids: number[]
}

export type DescribedIssue = IssueTarget & {
	show_label: string
}

type DescribeIssueOptions = {
	issue: ValidationIssue
	source_entities: PageSourceEntity[]
}

const describe_entity = (entity: PageSourceEntity | undefined): string => {
	return entity?.concept ? `${entity.category} '${describe_concept(entity.concept)}'` : entity?.category ?? 'Entity'
}

const describe_concept = ({ stem, sense }: ConceptKey): string => `${stem}-${sense}`

function describe_alternate(issue: AlternateIssue): string {
	const expected = issue.value === 'Equivalent Statement' ? 'rhetorical question' : issue.expected.values.map(value => `'${value}'`).join(' or ')
	return `Clause is '${issue.value}', so a ${expected} should be directly ${issue.expected.direction} it.`
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
	return { ...target, show_label: build_show_label({ entity_ids: target.entity_ids, source_entities }) }
}
