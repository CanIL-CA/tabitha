type SourceEntity = {
	type: string
	label: string
	features: string
	value: string
	concept: Concept|null
	pairing: Concept|null
}

type SourceReference = {
	type: string
	id_primary: string
	id_secondary: string
	id_tertiary: string
}
type ExampleReference = {
	type: string
	ref_id_primary: number
	ref_id_secondary: number
	ref_id_tertiary: number
}


type ContextArguments = Record<string, string>

type ContextArgumentFinder = (location: {
	entity_index: number
	source_entities: SourceEntity[]
}) => ContextArguments
type PartOfSpeech = 'Noun' | 'Verb' | 'Adjective' | 'Adverb' | 'Adposition'
type FinderLookup = Record<PartOfSpeech, ContextArgumentFinder> & {
	[key: string]: ContextArgumentFinder
}
type EntityFilter = (entity: SourceEntity) => boolean

type EntityCrawlerInit = {
	skip_phrases?: boolean
	skip_clauses?: boolean
	break_condition?: (entity: SourceEntity) => boolean
}
type EntityCrawlerNext = (start_index: number, source_entities: SourceEntity[]) => number

type FeatureCode = string
type FeatureName = string
type Feature = {
	index: number
	values: Record<FeatureCode, FeatureName>
}

type ArgumentInfo = {
	filter: EntityFilter
	key: (index: number) => string
	value: (index: number) => string
}
