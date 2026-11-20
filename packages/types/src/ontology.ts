import type { Reference } from './reference'
import type { ConceptKey, SourceStatus } from './core'

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

export type ContextArgumentName = string
export type ContextArgumentValue = string
export type ContextArguments = Record<ContextArgumentName, ContextArgumentValue>
