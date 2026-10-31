import type { ConceptKey, PairingType } from '@tabitha/types'
import type { PageSourceEntity } from '#lib/types.js'

type FeatureOptions = {
	readonly entities: readonly PageSourceEntity[]
	readonly feature_name: string
}

const count_distinct = (values: readonly unknown[]): number =>
	new Set(values.map(value => JSON.stringify(value))).size

const concept_key = (concept: ConceptKey | null) =>
	concept && [concept.stem, concept.sense, concept.part_of_speech]

const find_feature_value = ({ entity, feature_name }: { entity: PageSourceEntity, feature_name: string }) =>
	entity.features.find(feature => feature.name === feature_name)?.value

export const apply_feature_value = ({ entities, feature_name, value }: FeatureOptions & { readonly value: string }) => {
	for (const entity of entities) {
		const feature = entity.features.find(({ name }) => name === feature_name)
		if (feature) feature.value = value
	}
}

export const do_feature_values_differ = ({ entities, feature_name }: FeatureOptions): boolean =>
	count_distinct(entities.map(entity => find_feature_value({ entity, feature_name }))) > 1

/** Each entity gets its own copy, so editing one entity's concept later never changes another's. */
export const apply_concept = ({ entities, concept }: { entities: readonly PageSourceEntity[], concept: ConceptKey }) => {
	for (const entity of entities) {
		entity.concept = { ...concept }
	}
}

export const do_concepts_differ = ({ concepts }: { concepts: readonly ConceptKey[] }): boolean =>
	count_distinct(concepts.map(concept_key)) > 1

export const do_stems_differ = ({ concepts }: { concepts: readonly ConceptKey[] }): boolean =>
	count_distinct(concepts.map(({ stem }) => stem)) > 1

export const apply_sense = ({ concepts, sense }: { concepts: readonly ConceptKey[], sense: string }) => {
	for (const concept of concepts) {
		concept.sense = sense
	}
}

type PairingOptions = {
	readonly entities: readonly PageSourceEntity[]
	readonly pairing_concept: ConceptKey | null
	readonly pairing_type: PairingType | null
}

/** Passing null for both removes the pairing. */
export const apply_pairing = ({ entities, pairing_concept, pairing_type }: PairingOptions) => {
	for (const entity of entities) {
		entity.pairing_concept = pairing_concept && { ...pairing_concept }
		entity.pairing_type = pairing_type
	}
}

export const do_pairings_differ = ({ entities }: { entities: readonly PageSourceEntity[] }): boolean =>
	count_distinct(entities.map(({ pairing_concept, pairing_type }) => [concept_key(pairing_concept), pairing_type])) > 1

export const apply_noun_list_index = ({ entities, index }: { entities: readonly PageSourceEntity[], index: string }) => {
	for (const entity of entities) {
		entity.noun_list_index = index
	}
}

export const do_noun_list_indexes_differ = ({ entities }: { entities: readonly PageSourceEntity[] }): boolean =>
	count_distinct(entities.map(({ noun_list_index }) => noun_list_index)) > 1
