import type { Reference } from '@tabitha/types'

// Only what names the concept, so that any concept can be used, including a function word
type ConceptParts = { stem: string; sense: string; part_of_speech: string }

const CURATED_EXAMPLE_PAGE = '/protected/concept/curated_example'

const build_concept_param = ({ stem, sense, part_of_speech }: ConceptParts): string => encodeURIComponent(`${stem}-${sense}-${part_of_speech}`)

/** The page to make a curated example of the concept from a verse that uses it */
export function make_curated_example_url({ concept, reference }: { concept: ConceptParts; reference: Reference }): string {
	const reference_param = [reference.type, reference.id_primary, reference.id_secondary, reference.id_tertiary].map(encodeURIComponent).join('/')
	return `${CURATED_EXAMPLE_PAGE}?concept=${build_concept_param(concept)}&reference=${reference_param}`
}

/** The page to edit the concept's curated example at the index, among its examples */
export function edit_curated_example_url({ concept, index }: { concept: ConceptParts; index: number }): string {
	return `${CURATED_EXAMPLE_PAGE}?concept=${build_concept_param(concept)}&replaces=${index}`
}
