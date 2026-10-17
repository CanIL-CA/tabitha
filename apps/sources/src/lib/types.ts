import type { SourceEntityCategory, EncodingEntityCategory, FeatureName, FeatureValue, NounList, Reference, SourceEntity, SourceStatus } from '@tabitha/types'
import type { SensesByConcept } from '#lib/data/ontology_senses.js'

//===============
// UI related

export type ViewSettings = {
	show_hover_popups: boolean
}

export type NavData = {
	previous: Reference | null
	current: Reference
	next: Reference | null
}

export type PageData = {
	source: PageSource
	nav_data: NavData
	ontology_senses: SensesByConcept
}

export type PageSource = DbSource & {
	parsed_semantic_encoding: PageSourceEntity[]
	noun_list: NounList
}

export type PageSourceEntity = SourceEntity & {
	id: number
	parent_id: number
	boundary_category: string
}

//===============
// Db types

export type DbSource = Reference & {
	phase_1_encoding: string
	semantic_encoding: string
	status: SourceStatus
	comments: string
	notes: string
}

export type DbFeature = {
	category: SourceEntityCategory
	position: number
	code: string
	feature: FeatureName
	value: FeatureValue
	example?: string
}

//===============
// Feature map

export type FeatureValueInfo = {
	value: FeatureValue
	code: string
	example?: string
}

export type FeatureInfo = {
	name: FeatureName
	values: FeatureValueInfo[]
}

export type FeatureMap = Map<EncodingEntityCategory, FeatureInfo[]>

//===============
// Phase 1 text search

export type MatchSegment = {
	text: string
	is_match: boolean
}

export type Phase1SearchHit = {
	reference: Reference
	status: SourceStatus
	segments: MatchSegment[]
}

export type Phase1SearchResults = {
	terms: string[]
	hits: Phase1SearchHit[]
	total_count: number
}
