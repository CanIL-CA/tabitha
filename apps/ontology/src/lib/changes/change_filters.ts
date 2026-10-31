import { concepts_match } from '@tabitha/types/patterns'
import { change_made_between_versions } from '#lib/changes/changes.js'
import type { OntologyChange, OntologyChangeAction, OntologyChangeDataFields } from '#lib/types.js'
import type { ConceptKey, PartOfSpeech } from '@tabitha/types'

export type AffectedField = keyof OntologyChangeDataFields

export type ChangeStatus = 'pending' | 'suggested' | 'approved' | 'applied'

export type ChangeFilterValues = {
	status: ChangeStatus | 'all'
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
	status: 'all',
	since: 'all',
	before: 'all',
	action_type: 'all',
	concept_key: null,
	part_of_speech: 'all',
	affected_field: 'all',
}

export const APPLIED_CHANGE_FILTERS: ChangeFilterValues = { ...NO_CHANGE_FILTERS, status: 'applied' }

export const STATUS_LABELS: Record<ChangeStatus, string> = {
	pending: 'Pending',
	suggested: 'Suggested',
	approved: 'Approved',
	applied: 'Applied',
}

// pending covers both suggested and approved, i.e. everything not yet applied
const STATUS_MATCHERS: Record<ChangeStatus, (change: OntologyChange) => boolean> = {
	pending: change => !change.applied_date,
	suggested: change => !!change.suggested_by && !change.approved_by,
	approved: change => !!change.approved_by && !change.applied_date,
	applied: change => !!change.applied_date,
}

const is_status_filter = (value: string | null): value is ChangeFilterValues['status'] =>
	value === 'all' || value !== null && Object.hasOwn(STATUS_MATCHERS, value)

// Only these filters are kept in the URL, so a link or a reload can carry them; the rest live on the page.
const URL_FILTER_KEYS = ['status', 'since', 'before'] as const

type ParseChangeFiltersOptions = {
	readonly search_params: URLSearchParams
	readonly defaults: ChangeFilterValues
}

export const parse_change_filters = ({ search_params, defaults }: ParseChangeFiltersOptions): ChangeFilterValues => {
	const status = search_params.get('status')
	return {
		...defaults,
		status: is_status_filter(status) ? status : defaults.status,
		since: search_params.get('since') ?? defaults.since,
		before: search_params.get('before') ?? defaults.before,
	}
}

type ToChangeFilterParamsOptions = {
	readonly filters: ChangeFilterValues
	readonly defaults: ChangeFilterValues
}

// Leaves out filters still at the page's default, so the URL only shows what was actually chosen.
export const to_change_filter_params = ({ filters, defaults }: ToChangeFilterParamsOptions): URLSearchParams =>
	new URLSearchParams(URL_FILTER_KEYS.filter(key => filters[key] !== defaults[key]).map(key => [key, filters[key]]))

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

export const filter_changes = ({ changes, status, since, before, action_type, concept_key, part_of_speech, affected_field }: FilterChangesOptions): OntologyChange[] => {
	const concept = concept_key ? parse_concept_key(concept_key) : null
	const is_made_between_versions = change_made_between_versions({ since, before })

	return changes.filter(change =>
		(status === 'all' || STATUS_MATCHERS[status](change))
		&& is_made_between_versions(change)
		&& (action_type === 'all' || change.action === action_type)
		&& (concept === null || concepts_match({ a: change.concept, b: concept }))
		&& (part_of_speech === 'all' || change.concept.part_of_speech === part_of_speech)
		&& (affected_field === 'all' || change.data[affected_field] !== undefined),
	)
}
