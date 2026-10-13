import type { PrimaryIdReference, Reference, SecondaryIdReference } from './reference'
import type { ConceptKey, SourceEntityCategory, SourceStatus } from './core'

//===============
// Core types

// Intentionally open: target encoding supports user-defined categories (an '&'-prefixed
// code in the raw encoding), so there is no fixed set of target category names to enumerate.
export type TargetEntityCategory = string
export type EncodingEntityCategory = SourceEntityCategory | TargetEntityCategory

export type PairingType = 'simple-complex' | 'dynamic-literal' | 'metric-biblical'

export type FeatureName = string
export type FeatureValue = string

export type EntityFeature = {
	name: FeatureName
	value: FeatureValue
}

//===============
// partial-reference based APIs

export type SourceType = Pick<Reference, 'type'>
export type PrimaryId = Pick<Reference, 'id_primary'>
export type SecondaryId = Pick<Reference, 'id_secondary'>
export type TertiaryId = Pick<Reference, 'id_tertiary'>

//===============
// main source API

export type SourceFeaturesData = {
	feature_codes: string
	features: EntityFeature[]
	noun_list_index: string | null
}

export type SourceConceptData = {
	concept: ConceptKey | null
	pairing_concept: ConceptKey | null
	pairing_type: PairingType | null
}

export type SourceEntity = {
	category: SourceEntityCategory
	category_abbr: string
	value: string
} & SourceConceptData & SourceFeaturesData

export type SourceResult = Reference & {
	phase_1_encoding: string
	semantic_encoding: string
	parsed_semantic_encoding: SourceEntity[]
	comments: string
	status: SourceStatus
	notes: string
}

//===============
// simple-json API

export type SourceSimpleJsonResult = {
	encoding: SourceSimpleJsonEntity[]
	glosses?: Record<string, string>
}

export type SourceSimpleJsonEntity = {
	category: EncodingEntityCategory
	concept?: string
	pairing_concept?: string
	target?: string
	features?: Record<FeatureName, FeatureValue>
	children?: SourceSimpleJsonEntity[]
}

//===============
// raw-to-json API

// This is used while parsing encoding that is partially-generated in a target language
export type TargetEntity = {
	category: TargetEntityCategory
	category_abbr: string
	value: string
	concept: ConceptKey | null
	target: string
} & SourceFeaturesData

// Combination of SourceEntity and TargetEntity used in Sources encoding pipeline
export type EncodingEntity = {
	category: EncodingEntityCategory
	category_abbr: string
	value: string
	concept: ConceptKey | null
	pairing_concept?: ConceptKey | null
	pairing_type?: PairingType | null
	target?: string
} & SourceFeaturesData

//===============
// analyze API

export type NounList = NounListEntry[]

export type NounListEntry = {
	index: string
	noun: string
}

// TODO actually use this
export type AnalyzerStatus = 'ok' | 'warning' | 'error'

export type AnalysisResult = {
	// status: AnalyzerStatus
	// notes: AnalysisNote[]
	source_entities: SourceEntity[]
	noun_list: NounList
}

//===============
// lookup/features API

export type SourceFeature = {
	category: SourceEntityCategory
	position: number
	code: string
	feature: FeatureName
	value: FeatureValue
	example?: string
}

export type SourceFeatureResult = {
	source: SourceFeature[]
}

//===============
// lookup/status API

export type PrimaryIdSourceStatusResult = {
	reference: PrimaryIdReference
	status: SourceStatus
}

export type SecondaryIdSourceStatusResult = {
	reference: SecondaryIdReference
	status: SourceStatus
}

export type SourceStatusResult = {
	reference: Reference
	status: SourceStatus
}

//===============
// lookup/encoded API

/** Whether a single verse actually holds a semantic encoding. See `/lookup/encoded` in the Sources README for why this is a separate lookup from `status` above. */
export type SourceEncodedResult = {
	reference: Reference
	has_encoding: boolean
}
