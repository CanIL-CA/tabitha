import { structure_entities } from './structured'
import { DEFAULTS } from '#lib/edit/default_entities.js'
import type { ConceptKey, PairingType } from '@tabitha/types'
import type { PageSourceEntity } from '#lib/types.js'

export type Features = Record<string, string>

const to_features = (features: Features) => Object.entries(features).map(([name, value]) => ({ name, value }))

export const open_clause = (features: Features = {}): PageSourceEntity => ({
	...DEFAULTS.EMPTY, category: 'Clause', category_abbr: 'C', value: '{', features: to_features(features),
})
export const close_clause = (): PageSourceEntity => ({ ...DEFAULTS.EMPTY, value: '}' })
export const open_phrase = ({ category, features = {} }: { category: 'Noun Phrase' | 'Verb Phrase' | 'Adjective Phrase' | 'Adverb Phrase'; features?: Features }): PageSourceEntity => ({
	...DEFAULTS.EMPTY, category, category_abbr: 'P', value: '(', features: to_features(features),
})
export const close_phrase = (): PageSourceEntity => ({ ...DEFAULTS.EMPTY, value: ')' })

export const word = ({ category, concept, pairing_concept = null, pairing_type = null, noun_list_index = null, features = {} }: {
	category: 'Noun' | 'Verb' | 'Adjective' | 'Adverb' | 'Adposition' | 'Conjunction'
	concept: ConceptKey
	pairing_concept?: ConceptKey | null
	pairing_type?: PairingType | null
	noun_list_index?: string | null
	features?: Features
}): PageSourceEntity => ({
	...DEFAULTS.EMPTY, category, value: concept.stem, concept, pairing_concept, pairing_type, noun_list_index, features: to_features(features),
})

export const structured = (entities: PageSourceEntity[]): PageSourceEntity[] => {
	structure_entities(entities)
	return entities
}

export const concept = ({ stem, part_of_speech = 'Noun' }: { stem: string; part_of_speech?: ConceptKey['part_of_speech'] }): ConceptKey => ({ stem, sense: 'A', part_of_speech })
