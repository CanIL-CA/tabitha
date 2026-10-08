import type { OntologyStatus, ConceptKey, SimplificationHint, Reference, PartOfSpeech } from '@tabitha/types'

export type DbRowExample = {
	ref_type: string
	ref_id_primary: string
	ref_id_secondary: number
	ref_id_tertiary: number
	context_json: string
}

export type DbRowConcept = ConceptKey & {
	id: string
	level: number
	categorization: string
	examples: string
	curated_examples: string
	gloss: string
	brief_gloss: string
	occurrences: number
}

// the Ontology-specific and more detailed version of OntologyResult from the search API
export type Concept = Omit<DbRowConcept, 'level' | 'curated_examples' | 'part_of_speech'> & {
	part_of_speech: PartOfSpeech | 'Function Word'
	level: string
	categories: string[]
	curated_examples: CuratedExample[]
	curated_examples_raw: string
	status: OntologyStatus
	how_to_hints: SimplificationHint[]
	pending_changes: OntologyChange[]
}

//===============
// Examples

export type CuratedExample = {
	reference: Reference
	encoding: SimplifiedSemanticEncoding
	sentence: string
}

export type SimpleEncodingFeature = {
	code: string
	value: string
}

export type SimplifiedEncodingEntity = {
	category: string
	word: string | undefined
	feature: SimpleEncodingFeature | undefined
}

export type SimplifiedSemanticEncoding = SimplifiedEncodingEntity[]

export type ContextArgumentMap = Map<string, string[]>
export type Option = string
export type Options = Set<Option>
export type FilterMap = Map<string, Options>
export type FilterRulesMap = Map<string, FilterMap>

//===============
// Ontology Change types

export type ConceptUpdateData = ConceptKey & {
	level: string
	gloss: string
	brief_gloss: string
	categories: string[]
	curated_examples: string
}

export type ConceptCreateData = ConceptUpdateData

export type OntologyChangeAction = 'create' | 'update' // TODO: | 'delete'

export type FieldChangeData<T> = {
	old?: T
	value: T
}

export type OntologyChangeDataFields = {
	level?: FieldChangeData<string>
	gloss?: FieldChangeData<string>
	brief_gloss?: FieldChangeData<string>
	categories?: FieldChangeData<string[]>
	curated_examples?: FieldChangeData<string>
}

// The domain-layer view of a requested change: a field-level old/value diff plus approval/application
// bookkeeping. This is distinct from a QueuedMutation (apps/ontology/src/lib/offline/queue.ts), the
// transport-layer view: a not-yet-delivered write request carrying the full new record plus delivery
// bookkeeping (status, retry_count). Producing one from the other requires diffing the mutation's body
// against a concept's current data (see apps/ontology/src/lib/offline/pending.ts).
export type OntologyChange = {
	id: number
	concept: ConceptKey
	data: OntologyChangeDataFields
	action: OntologyChangeAction
	suggested_by: WorkflowInfo | null
	approved_by: WorkflowInfo | null
	applied_date: Date | null
	version: string | null
	// set for changes synthesized client-side from the offline queue -- not yet sent to the server at all,
	// as opposed to a change the server recorded but hasn't applied/approved yet
	is_unsynced?: boolean
	// whether the viewing user is allowed to approve this specific change -- computed server-side (see
	// can_approve_change in changes.ts) since it depends on the viewer's permissions, not just the change itself
	can_approve?: boolean
}

export type WorkflowInfo = {
	id?: number
	name: string
	date: Date
}

export type ApplyPendingResult = {
	count: number
	failed: number
	version: string
	changes: OntologyChange[]
	timestamp: Date
}

export type SaveResult = 'applied' | 'pending' | 'queued'

//===============
// User types

export type UserEmail = string

export type UserPermissions = {
	has_protected_access: boolean
	can_add: boolean
	can_update: boolean
}

export type OntologyUser = {
	id: number | undefined
	email: UserEmail
	name: string
	permissions: UserPermissions
}

export type UserInfo = Pick<OntologyUser, 'id' | 'permissions'>
