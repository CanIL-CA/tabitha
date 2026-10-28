import type { Concept } from '#lib/types.js'

function IS_IN_ONTOLOGY(concept: Concept): boolean {
	return concept.status === 'in ontology'
}

function IS_OR_WILL_BE_IN_ONTOLOGY(concept: Concept): boolean {
	return ['in ontology', 'approved'].includes(concept.status)
}

function IS_COMPLEX(concept: Concept): boolean {
	return ['2', '3'].includes(concept.level)
}

export const CONCEPT_FILTERS = {
	IS_IN_ONTOLOGY,
	IS_OR_WILL_BE_IN_ONTOLOGY,
	IS_COMPLEX,
}