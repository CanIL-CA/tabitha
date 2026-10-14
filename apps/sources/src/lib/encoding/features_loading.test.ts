import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { D1DatabaseSession } from '@cloudflare/workers-types'
import type { SourceEntity } from '@tabitha/types'
import type { DbFeature } from '#lib/types.js'
import {
	fill_in_features,
	get_source_features,
	load_source_feature_map,
	load_target_feature_map,
	transform_features_to_codes,
} from './features'

function fake_db(rows: readonly DbFeature[]): D1DatabaseSession {
	return {
		prepare: () => ({ all: async () => ({ results: rows }) }),
	} as unknown as D1DatabaseSession
}

function db_feature({ category, position, feature, code, value }: Pick<DbFeature, 'category' | 'position' | 'feature' | 'code' | 'value'>): DbFeature {
	return { category, position, feature, code, value }
}

const VERB_FEATURES = [
	db_feature({ category: 'Verb', position: 1, feature: 'Time', code: 'd', value: 'Discourse' }),
	db_feature({ category: 'Verb', position: 1, feature: 'Time', code: 'p', value: 'Past' }),
	db_feature({ category: 'Verb', position: 2, feature: 'Aspect', code: '.', value: 'Unmarked' }),
	db_feature({ category: 'Verb', position: 2, feature: 'Aspect', code: 'c', value: 'Completive' }),
]

const NOUN_FEATURES = [
	db_feature({ category: 'Noun', position: 1, feature: 'Number', code: 's', value: 'Singular' }),
	db_feature({ category: 'Noun', position: 1, feature: 'Number', code: 'p', value: 'Plural' }),
]

function verb_entity(overrides: Partial<SourceEntity>): SourceEntity {
	return {
		category: 'Verb',
		category_abbr: 'V',
		value: 'love',
		features: [],
		feature_codes: '',
		noun_list_index: null,
		concept: null,
		pairing_concept: null,
		pairing_type: null,
		...overrides,
	}
}

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

describe('get_source_features', () => {
	it('returns every row of the Features table', async () => {
		expect(await get_source_features(fake_db(VERB_FEATURES))).toEqual(VERB_FEATURES)
	})
})

describe('load_source_feature_map', () => {
	it('groups the rows by category, then by feature, keeping each feature\'s values', async () => {
		const feature_map = await load_source_feature_map(fake_db([...VERB_FEATURES, ...NOUN_FEATURES]))

		expect([...feature_map.keys()].toSorted()).toEqual(['Noun', 'Verb'])
		expect(feature_map.get('Verb')?.map(({ name }) => name)).toEqual(['Time', 'Aspect'])
		expect(feature_map.get('Verb')?.[0].values.map(({ code }) => code)).toEqual(['d', 'p'])
		expect(feature_map.get('Noun')?.[0].name).toBe('Number')
	})

	it('orders a category\'s features by position, whatever order the rows arrive in', async () => {
		const shuffled = [VERB_FEATURES[2], VERB_FEATURES[3], VERB_FEATURES[0], VERB_FEATURES[1]]

		const feature_map = await load_source_feature_map(fake_db(shuffled))

		expect(feature_map.get('Verb')?.map(({ name }) => name)).toEqual(['Time', 'Aspect'])
	})

	it('is empty when the table has no rows', async () => {
		expect((await load_source_feature_map(fake_db([]))).size).toBe(0)
	})
})

describe('load_target_feature_map', () => {
	function respond_with({ body, status = 200 }: { body: object, status?: number }) {
		vi.stubGlobal('fetch', vi.fn(async () => Response.json(body, { status })))
	}

	it('has no map for a blank project, without asking the API', async () => {
		vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('should not be called') }))

		expect(await load_target_feature_map('')).toBeUndefined()
	})

	it('has no map when the API fails', async () => {
		respond_with({ body: { error: 'boom' }, status: 500 })

		expect(await load_target_feature_map('Indonesian')).toBeUndefined()
	})

	it('puts lexical features after the source ones in the same category, whatever their own positions', async () => {
		respond_with({
			body: {
				source: [db_feature({ category: 'Noun', position: 5, feature: 'Number', code: 's', value: 'Singular' })],
				lexical: [db_feature({ category: 'Noun', position: 1, feature: 'Class', code: 'a', value: 'Animate' })],
			},
		})

		const feature_map = await load_target_feature_map('Indonesian')

		expect(feature_map?.get('Noun')?.map(({ name }) => name)).toEqual(['Number', 'Class'])
	})
})

describe('fill_in_features', () => {
	async function verb_feature_map() {
		return load_source_feature_map(fake_db(VERB_FEATURES))
	}

	it('turns feature names and values into their codes, ignoring case', async () => {
		const result = fill_in_features({
			source_entity: verb_entity({ features: [{ name: 'time', value: 'PAST' }, { name: 'Aspect', value: 'completive' }] }),
			feature_map: await verb_feature_map(),
		})

		expect(result.feature_codes).toBe('pc')
		expect(result.features).toEqual([{ name: 'Time', value: 'Past' }, { name: 'Aspect', value: 'Completive' }])
	})

	it('fills a missing feature with the "." code when it has one, otherwise its first value', async () => {
		const result = fill_in_features({ source_entity: verb_entity({ features: [] }), feature_map: await verb_feature_map() })

		expect(result.feature_codes).toBe('d.')
		expect(result.features).toEqual([{ name: 'Time', value: 'Discourse' }, { name: 'Aspect', value: 'Unmarked' }])
	})

	it('falls back to the default for a value the feature doesn\'t have', async () => {
		const result = fill_in_features({
			source_entity: verb_entity({ features: [{ name: 'Time', value: 'Someday' }] }),
			feature_map: await verb_feature_map(),
		})

		expect(result.feature_codes).toBe('d.')
	})

	it('has no codes for a category the map doesn\'t know', async () => {
		const result = fill_in_features({ source_entity: verb_entity({ category: 'Adverb' }), feature_map: await verb_feature_map() })

		expect(result).toEqual({ feature_codes: '', features: [] })
	})
})

describe('transform_features_to_codes', () => {
	it('fills in the codes and features of every entity, leaving the rest of each entity alone', async () => {
		const entities = [
			verb_entity({ value: 'love', features: [{ name: 'Time', value: 'Past' }] }),
			verb_entity({ value: 'walk' }),
		]

		const result = await transform_features_to_codes({ db: fake_db(VERB_FEATURES), source_entities: entities })

		expect(result.map(({ value, feature_codes }) => ({ value, feature_codes }))).toEqual([
			{ value: 'love', feature_codes: 'p.' },
			{ value: 'walk', feature_codes: 'd.' },
		])
	})
})
