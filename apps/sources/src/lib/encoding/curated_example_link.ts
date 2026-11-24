import type { CaseFrameIssue, ValidationIssue } from './validation'
import type { PageSourceEntity } from '#lib/types.js'
import type { Reference } from '@tabitha/types'

type CuratedExampleLinkOptions = {
	issue: ValidationIssue
	source_entities: PageSourceEntity[]
	reference: Reference
	ontology_host: string
}

/**
 * Where the ontology makes a curated example that shows the concept of a case frame issue, from the word in this verse.
 * The ontology reads the verse as it is saved, so this is only right while the verse is as it was loaded.
 * It does not handle a word's pairing concept, so there is no link when the issue is about that.
 */
export function build_curated_example_link({ issue, source_entities, reference, ontology_host }: CuratedExampleLinkOptions): string | undefined {
	if (issue.check !== 'case_frame') return undefined

	const entity_id = issue.reason === 'no_categories' ? issue.entity_ids[0] : issue.entity_id
	const { stem, sense, part_of_speech } = issue.concept
	const word_concept = source_entities[entity_id]?.concept
	const is_word_concept = word_concept?.stem === stem && word_concept.sense === sense && word_concept.part_of_speech === part_of_speech
	if (!is_word_concept) return undefined

	const concept_param = encodeURIComponent(`${stem}-${sense}-${part_of_speech}`)
	const reference_param = [reference.type, reference.id_primary, reference.id_secondary, reference.id_tertiary].map(encodeURIComponent).join('/')
	return `${ontology_host}/protected/concept/curated_example?concept=${concept_param}&reference=${reference_param}&entity=${entity_id}`
}
