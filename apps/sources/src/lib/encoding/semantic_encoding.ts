import type { D1Database } from '@cloudflare/workers-types'
import { CATEGORY_ABBREVIATIONS, CATEGORY_NAME_LOOKUP, WORD_ENTITY_CATEGORIES } from './lookups'
import { load_source_feature_map, load_target_feature_map, decode_features } from './features'
import { structure_entities } from './structured'
import { IS_CARDINAL_NUMBER } from '@tabitha/types/patterns'
import type { SourceEntityCategory, NounListEntry, SourceConceptData, SourceEntity, TargetEntity, PairingType, PartOfSpeech, EncodingEntityCategory } from '@tabitha/types'
import type { PageSourceEntity } from '#lib/types.js'

/**
 * The phase_2_encoding looks something like:
 * ~\wd ~\tg c-IDp00NNNNNNNNNNNNN.............~\lu {~\wd ~\tg C-1A.....~\lu then~\wd ~\tg n-SAN.N........~\lu (...
 *
 * If present, the first character of the features indicates the 'entity' type.
 * This could be a clause/phrase boundary, part of speech, or even certain punctuation.
 *
 * '{' and '}' indicate a main clause boundary
 * '[' and ']' indicate a subordinate clause boundary
 * '(' and ')' indicate a phrase boundary
 *
 * Examples:
 * ~\wd ~\tg c-IDp00NNNNNNNNNNNNN.............~\lu {    => { type: 'c', label: 'Clause', features: 'IDp00NNNNNNNNNNNNN.............', value: '{' }
 * ~\wd ~\tg N-1A1SDAnK3NN........~\lu God  => { type: 'N', label: 'Noun', features: '1A1SDAnK3NN........', value: 'God' }
 * ~\wd ~\tg v-S.....~\lu (     => { type: 'v', label: 'VP', features: 'S.....', value: '(' }
 * ~\wd ~\tg C-1A.....~\lu then => { type: 'C', label: 'Conjunction', features: '1A.....', value: 'then' }
 * ~\wd ~\tg ~\lu )             => { type: '', label: '', features: '', value: ')' }
 * ~\wd ~\tg .-~\lu .           => { type: '.', label: 'period', features: '', value: '.' }
 * ~\\wd ~\\tg R-~\\lu |        => { type: 'R', label: 'Paragraph', features: '', value: '|' }
 */
type TransformSemanticEncodingOptions = {
	db: D1Database
	semantic_encoding: string
}

export async function transform_semantic_encoding({ db, semantic_encoding }: TransformSemanticEncodingOptions): Promise<SourceEntity[]> {
	const EXTRACT_TYPE_FEATURES_VALUES = /~\\wd ~\\tg (?:([\w.])-([^~]*))?~\\lu ([^~]+)/g
	const entities = [...semantic_encoding.matchAll(EXTRACT_TYPE_FEATURES_VALUES)]

	const feature_map = await load_source_feature_map(db)

	return entities.map(decode_entity)

	// ['~\wd ~\tg N-1A1SDAnK3NN........~\lu God', 'N', '1A1SDAnK3NN........', 'God']
	function decode_entity(entity_match: RegExpMatchArray): SourceEntity {
		const category_code = entity_match[1] ?? ''
		const feature_codes = entity_match[2] ?? ''
		const value = entity_match[3] === 'Paragraph' ? '|' : entity_match[3]

		const category = (CATEGORY_NAME_LOOKUP.get(category_code) || '') as SourceEntityCategory
		const category_abbr = CATEGORY_ABBREVIATIONS.get(category) || ''
		const ontology_data = decode_concept_data({ value, category, raw_feature_codes: feature_codes })
		const features = decode_features({ raw_feature_codes: feature_codes, category, feature_map })

		return {
			category,
			category_abbr,
			value,
			...features,
			...ontology_data,
		}
	}
}

type TransformTargetEncodingOptions = {
	db: D1Database
	semantic_encoding: string
	project: string
}

export async function transform_target_encoding({ db, semantic_encoding, project }: TransformTargetEncodingOptions): Promise<TargetEntity[]> {
	// In addition to the source encoding, '~\z1' denotes the target word
	const EXTRACT_TYPE_FEATURES_VALUES = /~\\wd ~\\tg ([^~]+)?~\\lu ([^~]+)~\\z1 ?([^~]+)?/g
	const entities = [...semantic_encoding.matchAll(EXTRACT_TYPE_FEATURES_VALUES)]

	const feature_map = await load_target_feature_map(project) || await load_source_feature_map(db)

	return entities.map(decode_entity)

	// ['~\wd ~\tg N-1A1SDAnK3NN........~\lu God~\z1 God', 'N-1A1SDAnK3NN........', 'God', 'God']
	function decode_entity(entity_match: RegExpMatchArray): TargetEntity {
		const category_code = entity_match[1]?.[0] || ''
		const is_user_defined = category_code === '&'

		const category = is_user_defined ? entity_match[1].slice(1) : CATEGORY_NAME_LOOKUP.get(category_code) || ''
		const category_abbr = is_user_defined ? category : CATEGORY_ABBREVIATIONS.get(category) || ''
		const raw_feature_codes = is_user_defined ? '' : entity_match[1]?.slice(2) || ''
		const { feature_codes, features, noun_list_index } = decode_features({ raw_feature_codes, category, feature_map })

		const value = entity_match[2]
		const concept = decode_concept_data({ value, category, raw_feature_codes }).concept
		const target = entity_match[3] === 'Paragraph' ? '|' : entity_match[3] || ''

		return {
			category,
			category_abbr,
			value,
			concept,
			target,
			feature_codes,
			features: features.map(({ value, name }) => ({ value, name: name || 'Unknown Lexical Feature' })),
			noun_list_index,
		}
	}
}

type ConceptPairingMatch = {
	stem: string
	pairing_type: PairingType
	pairing_sense: string
	pairing_stem: string
}

function parse_concept_pairing(value: string): ConceptPairingMatch | null {
	// follower/Adisciple -> follower / disciple-A
	const EXTRACT_PAIRING = /^(.+?)([\\/|])([A-Z])(.+)$/
	const match = value.match(EXTRACT_PAIRING)
	if (!match) return null

	const [, stem, separator, pairing_sense, pairing_stem] = match

	const pairing_type = determine_pairing_type({ separator, pairing_stem, pairing_sense })
	return { stem, pairing_type, pairing_sense, pairing_stem }
}

// the biblical unit pairing uses the same separator as simple-complex, so this is currently the only way to determine metric-biblical
const BIBLICAL_UNITS = ['bath-A', 'beka-A', 'cor-A', 'cubit-A', 'drachma-A', 'ephah-A', 'log-A', 'mina-A', 'shekel-A', 'span-A', 'stadion-A', 'talent-A' ]

function determine_pairing_type({ separator, pairing_stem, pairing_sense }: { separator: string, pairing_stem: string, pairing_sense: string }): PairingType {
	if (separator === '\\' || separator === '|') {
		return 'dynamic-literal'
	} else if (BIBLICAL_UNITS.includes(`${pairing_stem}-${pairing_sense}`) || IS_CARDINAL_NUMBER.test(pairing_stem)) {
		return 'metric-biblical'
	} else {
		return 'simple-complex'
	}
}

function decode_concept_data({ value, category, raw_feature_codes }: { value: string, category: EncodingEntityCategory, raw_feature_codes: string }): SourceConceptData {
	if (!WORD_ENTITY_CATEGORIES.has(category)) {
		return { concept: null, pairing_concept: null, pairing_type: null }
	}
	const part_of_speech = category as PartOfSpeech

	const sense = raw_feature_codes[1]
	const pairing = parse_concept_pairing(value)

	if (pairing) {
		return {
			concept: {
				stem: pairing.stem,
				sense,
				part_of_speech,
			},
			pairing_concept: {
				stem: pairing.pairing_stem,
				sense: pairing.pairing_sense,
				part_of_speech,
			},
			pairing_type: pairing.pairing_type,
		}
	}

	return {
		concept: {
			stem: value,
			sense,
			part_of_speech,
		},
		pairing_concept: null,
		pairing_type: null,
	}
}

export function encode_concept_data(entity: SourceEntity): { value: string } {
	// Encode the concept entity data back into the TBTA-compatible format for storage and generation
	if (entity.concept && entity.pairing_concept) {
		const separator = entity.pairing_type === 'dynamic-literal' ? '\\' : '/'
		return { value: `${entity.concept.stem}${separator}${entity.pairing_concept.sense}${entity.pairing_concept.stem}` }
	} else if (entity.concept) {
		return { value: entity.concept.stem }
	} else {
		return { value: entity.value }
	}
}

export function structure_semantic_encoding(entities: SourceEntity[]): PageSourceEntity[] {
	const new_entities: PageSourceEntity[] = entities.map((entity, i) => ({ ...entity, id: i, parent_id: -1, boundary_category: '' }))
	structure_entities(new_entities)
	return new_entities
}

export function get_noun_list(raw_encoding: string): NounListEntry[] {
	const noun_list_start = raw_encoding.lastIndexOf('~|') // this indicates the start of the noun list
	return raw_encoding
		.slice(noun_list_start + 2).trim()
		.split('|')
		.filter(entry => entry.length)
		.map((entry, index) => ({
			noun: `${entry.slice(1)}-${entry[0]}`,	// the sense is always the first letter
			index: index < 9 ? `${index + 1}` : String.fromCharCode('A'.charCodeAt(0) + (index - 9)),
		}))
}
