import type { Reference } from './reference'
import type { ConceptKey, SourceStatus } from './core'
import type { SourceEntity } from './source'

//===============
// Core types

export type OntologyStatus =
	| 'in ontology'
	| 'approved'
	| 'suggested'
	| 'not used'
	| 'function_word'
	| 'unknown'

//===============
// search API

export type ConceptSearchFilter = {
	q: string
	scope: 'stems' | 'glosses' | 'all' | 'english' | 'semantic'
	category: string
}

export type OntologyResult = ConceptKey & {
	id?: string
	level: string
	gloss: string
	categorization: string
	categories: string[]
	status: OntologyStatus
	how_to_hints: HowToEntry[]
}

export type HowToEntry = {
	structure: string
	pairing: string
	explication: string
}

//===============
// simplification_hints API

export type SimplificationHint = ConceptKey & HowToEntry & {
	ontology_status: OntologyStatus
	level: number
	notes?: string
}

//===============
// examples API

export type ConceptExample = {
	reference: Reference
	context: ContextArguments
	book_status: SourceStatus
}

//===============
// curated-examples/encode API

// `entities` start with the clause the example is about and end with that clause's closing bracket.
export type EncodeCuratedExampleRequest = {
	reference: Reference
	sentence: string
	entities: SourceEntity[]
}

// One line in the ontology's curated examples format, ready to append to a concept's curated examples,
// or why the entities cannot be encoded. The reason is a normal result, so it does not fail the request.
export type EncodeCuratedExampleResult =
	| { encoded_example: string }
	| { error: string }

export type ContextArgumentName = string
export type ContextArgumentValue = string
export type ContextArguments = Record<ContextArgumentName, ContextArgumentValue>
