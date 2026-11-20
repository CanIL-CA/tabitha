import { describe, expect, it } from 'vitest'
import type { D1DatabaseSession } from '@cloudflare/workers-types'
import type { DbFeature } from '#lib/types.js'
import { encode_source_entities, transform_semantic_encoding } from './semantic_encoding'

const FEATURES: DbFeature[] = [
	{ category: 'Noun', position: 1, feature: 'Number', code: 's', value: 'Singular' },
	{ category: 'Noun', position: 1, feature: 'Number', code: 'p', value: 'Plural' },
	{ category: 'Verb', position: 1, feature: 'Aspect', code: 'u', value: 'Unmarked' },
	{ category: 'Clause', position: 1, feature: 'Type', code: 'I', value: 'Independent' },
]

const db = {
	prepare: () => ({ all: async () => ({ results: FEATURES }) }),
} as unknown as D1DatabaseSession

const NOUN_LIST_SLOTS = 35

function word({ tag, value }: { tag: string, value: string }) {
	return `~\\wd ~\\tg ${tag}~\\lu ${value}`
}

/** A noun list always has 35 slots: `~|AGod|Bearth||||...|` */
function noun_list(entries: string[]) {
	const slots = Array.from({ length: NOUN_LIST_SLOTS }, (_, i) => entries[i] ?? '')
	return `~|${slots.join('|')}|`
}

const decode = (semantic_encoding: string) => transform_semantic_encoding({ db, semantic_encoding })

/**
 * Paste real-world encodings here. Each one is run through both round trips below, so it must be
 * the full stored encoding: every `~\wd ~\tg ...~\lu ...` word followed by the trailing noun list.
 */
const REAL_WORLD_ENCODINGS: { name: string, encoding: string }[] = [
	{
		name: 'Genesis 1:2',
		encoding: `~\\wd ~\\tg c-IDp00NNNNNNNNNNNVN.............~\\lu {~\\wd ~\\tg n-SAN.N........~\\lu (~\\wd ~\\tg N-1A1SDAnS3NN........~\\lu earth
~\\wd ~\\tg ~\\lu )~\\wd ~\\tg v-S.....~\\lu (~\\wd ~\\tg V-1DrUINAN...........~\\lu be~\\wd ~\\tg ~\\lu )~\\wd ~\\tg j-FP.....~\\lu (
~\\wd ~\\tg A-1AN.....~\\lu formless~\\wd ~\\tg ~\\lu )~\\wd ~\\tg j-LP.....~\\lu (~\\wd ~\\tg C-1C.....~\\lu and
~\\wd ~\\tg A-1AN.....~\\lu empty~\\wd ~\\tg ~\\lu )~\\wd ~\\tg .-~\\lu .~\\wd ~\\tg ~\\lu }~\\wd ~\\tg c-IDp00NNNNNNNNNNNfN.............~\\lu {
~\\wd ~\\tg n-SAN.N........~\\lu (~\\wd ~\\tg N-1A1SDAnS3NN........~\\lu earth~\\wd ~\\tg ~\\lu )~\\wd ~\\tg v-S.....~\\lu (
~\\wd ~\\tg V-1DrUINNN...........~\\lu have~\\wd ~\\tg ~\\lu )~\\wd ~\\tg n-SSN.N........~\\lu (~\\wd ~\\tg N-1A2SIAnS3NN........~\\lu shape/Aform
~\\wd ~\\tg ~\\lu )~\\wd ~\\tg .-~\\lu .~\\wd ~\\tg ~\\lu }~\\wd ~\\tg c-IDp00NNNNNNNNNNNlN.............~\\lu {
~\\wd ~\\tg C-1A.....~\\lu and~\\wd ~\\tg n-SAN.N........~\\lu (~\\wd ~\\tg N-1A3SGNnK3NN........~\\lu thing~\\wd ~\\tg ~\\lu )
~\\wd ~\\tg v-S.....~\\lu (~\\wd ~\\tg V-1ArUINAN...........~\\lu exist~\\wd ~\\tg ~\\lu )~\\wd ~\\tg n-SNN.N........~\\lu (
~\\wd ~\\tg P-1C.....~\\lu on~\\wd ~\\tg N-1A1SDAnS3NN........~\\lu earth~\\wd ~\\tg ~\\lu )~\\wd ~\\tg .-~\\lu .~\\wd ~\\tg ~\\lu }
~\\wd ~\\tg c-IDp00NNNNNNBNNNNNN.............~\\lu {~\\wd ~\\tg n-SAN.N........~\\lu (~\\wd ~\\tg N-1A4SGAnK3NN........~\\lu darkness
~\\wd ~\\tg ~\\lu )~\\wd ~\\tg v-S.....~\\lu (~\\wd ~\\tg V-1CrUINAN...........~\\lu cover~\\wd ~\\tg ~\\lu )
~\\wd ~\\tg n-SPN.N........~\\lu (~\\wd ~\\tg j-SA.....~\\lu (~\\wd ~\\tg A-1AN.....~\\lu deep~\\wd ~\\tg ~\\lu )
~\\wd ~\\tg N-1A5SFAnS3NN........~\\lu water~\\wd ~\\tg ~\\lu )~\\wd ~\\tg .-~\\lu .~\\wd ~\\tg ~\\lu }~\\wd ~\\tg c-IDp00NNNNNNBNNNNNN.............~\\lu {
~\\wd ~\\tg C-1A.....~\\lu and~\\wd ~\\tg n-SAN.N........~\\lu (~\\wd ~\\tg N-1A6SDAnS3NN........~\\lu Spirit
~\\wd ~\\tg n-SNN.N........~\\lu (~\\wd ~\\tg P-1A.....~\\lu -Generic Genitive~\\wd ~\\tg N-1A7SDAnS3NN........~\\lu God
~\\wd ~\\tg ~\\lu )~\\wd ~\\tg ~\\lu )~\\wd ~\\tg v-S.....~\\lu (~\\wd ~\\tg V-1DrUINAN...........~\\lu move/Ahover
~\\wd ~\\tg ~\\lu )~\\wd ~\\tg n-SNN.N........~\\lu (~\\wd ~\\tg P-1A.....~\\lu over~\\wd ~\\tg N-1A5SDAnS3NN........~\\lu water
~\\wd ~\\tg ~\\lu )~\\wd ~\\tg .-~\\lu .~\\wd ~\\tg ~\\lu }
~|Aearth|Ashape/Aform|Athing|Adarkness|Awater|ASpirit|AGod|||||||||||||||||||||||||||||`.replaceAll('\n', ''),
	},
	{
		name: 'Matthew 4:3',
		encoding: `~\\wd ~\\tg c-IDp00NNNNNNNNNNNNN.............~\\lu {~\\wd ~\\tg n-SAN.N........~\\lu (~\\wd ~\\tg N-1A1SDAnS3NN........~\\lu devil
~\\wd ~\\tg c-tDp00NNNNNNNNNNNNN.............~\\lu [~\\wd ~\\tg n-SAN.N........~\\lu (~\\wd ~\\tg N-1A1SDAnS3NN........~\\lu devil
~\\wd ~\\tg ~\\lu )~\\wd ~\\tg v-S.....~\\lu (~\\wd ~\\tg V-1APRINAN...........~\\lu tempt~\\wd ~\\tg ~\\lu )
~\\wd ~\\tg n-SPI.N........~\\lu (~\\wd ~\\tg N-1A2PGAnK3NN........~\\lu person~\\wd ~\\tg ~\\lu )~\\wd ~\\tg ~\\lu ]
~\\wd ~\\tg ~\\lu )~\\wd ~\\tg v-S.....~\\lu (~\\wd ~\\tg V-1ArUINAN...........~\\lu come~\\wd ~\\tg ~\\lu )
~\\wd ~\\tg n-SdN.N........~\\lu (~\\wd ~\\tg N-1A3SDAnS3NN........~\\lu Jesus~\\wd ~\\tg ~\\lu )~\\wd ~\\tg .-~\\lu .
~\\wd ~\\tg ~\\lu }~\\wd ~\\tg c-IDp00NNNNNNNNNNNNN.............~\\lu {~\\wd ~\\tg C-1A.....~\\lu and~\\wd ~\\tg n-SAN.N........~\\lu (
~\\wd ~\\tg N-1A1SDAnS3NN........~\\lu devil~\\wd ~\\tg ~\\lu )~\\wd ~\\tg v-S.....~\\lu (~\\wd ~\\tg V-1ArUINAN...........~\\lu say
~\\wd ~\\tg ~\\lu )~\\wd ~\\tg n-SPN.N........~\\lu (~\\wd ~\\tg N-1A3SDAnS3NN........~\\lu Jesus~\\wd ~\\tg ~\\lu )
~\\wd ~\\tg c-PIpZRnNNNNNNNNNNNN.............~\\lu [~\\wd ~\\tg r-1A.....~\\lu -QuoteBegin~\\wd ~\\tg c-EDpZRnNNNNNNNNNNNN.............~\\lu [
~\\wd ~\\tg P-1A.....~\\lu if~\\wd ~\\tg n-SAN.N........~\\lu (~\\wd ~\\tg N-1A3SDAnS2NN........~\\lu Jesus~\\wd ~\\tg ~\\lu )
~\\wd ~\\tg v-S.....~\\lu (~\\wd ~\\tg V-1BPUINAN...........~\\lu be~\\wd ~\\tg ~\\lu )~\\wd ~\\tg n-SSN.N........~\\lu (
~\\wd ~\\tg N-1A4SDAnS3NN........~\\lu Son~\\wd ~\\tg n-SNN.N........~\\lu (~\\wd ~\\tg P-1A.....~\\lu -Kinship
~\\wd ~\\tg N-1A5SDAnS3NN........~\\lu God~\\wd ~\\tg ~\\lu )~\\wd ~\\tg ~\\lu )~\\wd ~\\tg ~\\lu ]~\\wd ~\\tg n-SAN.N........~\\lu (
~\\wd ~\\tg N-1A3SDAnS2NN........~\\lu Jesus~\\wd ~\\tg ~\\lu )~\\wd ~\\tg v-S.....~\\lu (~\\wd ~\\tg V-1BEUINAN...........~\\lu tell
~\\wd ~\\tg ~\\lu )~\\wd ~\\tg n-SPN.N........~\\lu (~\\wd ~\\tg N-1A6PDACS3NN........~\\lu stone~\\wd ~\\tg ~\\lu )
~\\wd ~\\tg c-PDpZRnNNNNNNNNNNNN.............~\\lu [~\\wd ~\\tg n-SAN.N........~\\lu (~\\wd ~\\tg N-1A6PDACS3NN........~\\lu stone
~\\wd ~\\tg ~\\lu )~\\wd ~\\tg v-S.....~\\lu (~\\wd ~\\tg V-1HEUINAN...........~\\lu become~\\wd ~\\tg ~\\lu )
~\\wd ~\\tg n-SSN.N........~\\lu (~\\wd ~\\tg N-1A7SGAnK3NN........~\\lu bread~\\wd ~\\tg ~\\lu )~\\wd ~\\tg ~\\lu ]
~\\wd ~\\tg r-1A.....~\\lu -QuoteEnd~\\wd ~\\tg ~\\lu ]~\\wd ~\\tg .-~\\lu .~\\wd ~\\tg ~\\lu }
~|Adevil|Aperson|AJesus|ASon|AGod|Astone|Abread|||||||||||||||||||||||||||||`.replaceAll('\n', ''),
	},
	{
		name: 'Luke 11:3',
		encoding: `~\\wd ~\\tg c-IIp00NNNNNNNNNNNNN.............~\\lu {~\\wd ~\\tg n-SAN.N........~\\lu (~\\wd ~\\tg N-1A1SDAnS2NN........~\\lu Father
~\\wd ~\\tg ~\\lu )~\\wd ~\\tg v-S.....~\\lu (~\\wd ~\\tg V-1AEUINAN...........~\\lu give~\\wd ~\\tg ~\\lu )
~\\wd ~\\tg n-SPN.N........~\\lu (~\\wd ~\\tg N-1A2SGAnS3NN........~\\lu food\\Abread~\\wd ~\\tg c-TDp00NNNNNNNNNNNNN.............~\\lu [
~\\wd ~\\tg n-SAN.N........~\\lu (~\\wd ~\\tg N-1A3PDAnSANN........~\\lu follower/Adisciple~\\wd ~\\tg ~\\lu )~\\wd ~\\tg v-S.....~\\lu (
~\\wd ~\\tg V-1BPUINAN...........~\\lu need~\\wd ~\\tg ~\\lu )~\\wd ~\\tg n-SPN.N........~\\lu (~\\wd ~\\tg N-1A2SGAnS3NN........~\\lu food\\Abread
~\\wd ~\\tg ~\\lu )~\\wd ~\\tg n-SNN.N........~\\lu (~\\wd ~\\tg P-1A.....~\\lu during~\\wd ~\\tg j-SA.....~\\lu (
~\\wd ~\\tg A-1AN.....~\\lu each~\\wd ~\\tg ~\\lu )~\\wd ~\\tg N-1A4SGAnN3NN........~\\lu day~\\wd ~\\tg ~\\lu )~\\wd ~\\tg ~\\lu ]
~\\wd ~\\tg ~\\lu )~\\wd ~\\tg n-SdN.N........~\\lu (~\\wd ~\\tg N-1A3PDAnSANN........~\\lu follower/Adisciple~\\wd ~\\tg ~\\lu )
~\\wd ~\\tg n-SNN.N........~\\lu (~\\wd ~\\tg P-1E.....~\\lu on~\\wd ~\\tg j-SA.....~\\lu (~\\wd ~\\tg A-1AN.....~\\lu each
~\\wd ~\\tg ~\\lu )~\\wd ~\\tg N-1A5SGAnS3NT........~\\lu day~\\wd ~\\tg ~\\lu )~\\wd ~\\tg .-~\\lu .~\\wd ~\\tg ~\\lu }
~|AFather|Afood\\Abread|Afollower/Adisciple|Aday|Aday|||||||||||||||||||||||||||||||`.replaceAll('\n', ''),
	},
]

const SYNTHETIC_ENCODINGS: { name: string, encoding: string }[] = [
	{
		name: 'a single noun',
		encoding: word({ tag: 'N-1A1s', value: 'God' }) + noun_list(['AGod']),
	},
	{
		name: 'clause boundaries around nouns and a verb',
		encoding: [
			word({ tag: 'c-I', value: '{' }),
			word({ tag: 'n-SA', value: '(' }),
			word({ tag: 'N-1A1s', value: 'God' }),
			word({ tag: '', value: ')' }),
			word({ tag: 'v-S', value: '(' }),
			word({ tag: 'V-1Au', value: 'create' }),
			word({ tag: '', value: ')' }),
			word({ tag: 'n-SP', value: '(' }),
			word({ tag: 'N-1B2p', value: 'heaven' }),
			word({ tag: '', value: ')' }),
			word({ tag: '', value: '}' }),
			noun_list(['AGod', 'Bheaven']),
		].join(''),
	},
	{
		name: 'simple-complex and dynamic-literal pairings',
		encoding: [
			word({ tag: 'N-1A1s', value: 'follower/Adisciple' }),
			word({ tag: 'V-1Au', value: 'take\\Bgrasp' }),
			noun_list(['Afollower/Adisciple']),
		].join(''),
	},
	{
		name: 'words with no category',
		encoding: word({ tag: '', value: ')' }) + noun_list([]),
	},
	{
		name: 'a noun list that uses letter indexes',
		encoding: [
			word({ tag: 'N-1AAs', value: 'light' }),
			word({ tag: 'N-1BZs', value: 'darkness' }),
			noun_list(Object.assign(new Array<string>(NOUN_LIST_SLOTS).fill(''), { 9: 'Alight', 34: 'Bdarkness' })),
		].join(''),
	},
]

describe('encode_source_entities is the inverse of transform_semantic_encoding', () => {
	const all_encodings = [...REAL_WORLD_ENCODINGS, ...SYNTHETIC_ENCODINGS]

	it.each(all_encodings)('re-encodes the decoded entities of $name to the original encoding', async ({ encoding, name }) => {
		const entities = await decode(encoding)
		const re_encoded = encode_source_entities(entities)

		expect(re_encoded, name).toBe(encoding)
	})

	it.each(all_encodings)('decodes the re-encoded $name back to the same entities', async ({ encoding }) => {
		const entities = await decode(encoding)
		const round_tripped = await decode(encode_source_entities(entities))

		expect(round_tripped).toEqual(entities)
	})
})

describe('encode_source_entities normalization', () => {
	it('writes the legacy "|" paragraph marker as "Paragraph"', async () => {
		const entities = await decode(word({ tag: 'R-', value: '|' }))

		expect(encode_source_entities(entities)).toBe(word({ tag: 'R-', value: 'Paragraph' }) + noun_list([]))
	})

	it('writes only an empty noun list when there are no entities', () => {
		expect(encode_source_entities([])).toBe(noun_list([]))
	})

	it('keeps the first noun for a repeated noun list index', async () => {
		const entities = await decode(
			word({ tag: 'N-1A1s', value: 'God' }) + word({ tag: 'N-1B1s', value: 'Lord' }),
		)

		expect(encode_source_entities(entities)).toBe(
			word({ tag: 'N-1A1s', value: 'God' }) + word({ tag: 'N-1B1s', value: 'Lord' }) + noun_list(['AGod']),
		)
	})
})
