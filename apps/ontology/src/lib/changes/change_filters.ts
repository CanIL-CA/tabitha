import { concepts_match } from '@tabitha/types/patterns'
import { change_made_between_versions } from '#lib/changes/changes.js'
import type { OntologyChange, OntologyChangeAction, OntologyChangeDataFields } from '#lib/types.js'
import type { ConceptKey, PartOfSpeech } from '@tabitha/types'

export type AffectedField = keyof OntologyChangeDataFields

export type ChangeFilterValues = {
	since: string
	before: string
	action_type: OntologyChangeAction | 'all'
	concept_key: string | null
	part_of_speech: PartOfSpeech | 'all'
	affected_field: AffectedField | 'all'
}

type FilterChangesOptions = ChangeFilterValues & {
	readonly changes: OntologyChange[]
}

export const NO_CHANGE_FILTERS: ChangeFilterValues = {
	since: 'all',
	before: 'all',
	action_type: 'all',
	concept_key: null,
	part_of_speech: 'all',
	affected_field: 'all',
}

export const AFFECTED_FIELD_LABELS: Record<AffectedField, string> = {
	level: 'Level',
	gloss: 'Gloss',
	brief_gloss: 'Brief gloss',
	categories: 'Theta grid / Categorization',
	curated_examples: 'Curated examples',
}

export const to_concept_key = ({ concept: { stem, sense, part_of_speech } }: OntologyChange): string =>
	`${stem}|${sense}|${part_of_speech}`

export const parse_concept_key = (key: string): ConceptKey => {
	const [stem, sense, part_of_speech] = key.split('|')
	return { stem, sense, part_of_speech: part_of_speech as PartOfSpeech }
}

export const filter_changes = ({ changes, since, before, action_type, concept_key, part_of_speech, affected_field }: FilterChangesOptions): OntologyChange[] => {
	const concept = concept_key ? parse_concept_key(concept_key) : null
	const is_made_between_versions = change_made_between_versions({ since, before })

	return changes.filter(change =>
		is_made_between_versions(change)
		&& (action_type === 'all' || change.action === action_type)
		&& (concept === null || concepts_match({ a: change.concept, b: concept }))
		&& (part_of_speech === 'all' || change.concept.part_of_speech === part_of_speech)
		&& (affected_field === 'all' || change.data[affected_field] !== undefined),
	)
}
