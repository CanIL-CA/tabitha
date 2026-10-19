import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { D1DatabaseSession } from '@cloudflare/workers-types'
import type { DbFeature } from '#lib/types.js'
import { transform_semantic_encoding, transform_target_encoding } from './semantic_encoding'

const FEATURES: DbFeature[] = [
	{ category: 'Noun', position: 1, feature: 'Number', code: 's', value: 'Singular' },
	{ category: 'Noun', position: 1, feature: 'Number', code: 'p', value: 'Plural' },
	{ category: 'Verb', position: 1, feature: 'Aspect', code: 'u', value: 'Unmarked' },
	{ category: 'Clause', position: 1, feature: 'Type', code: 'I', value: 'Independent' },
]

const db = {
	prepare: () => ({ all: async () => ({ results: FEATURES }) }),
} as unknown as D1DatabaseSession

// A word in the encoding looks like `~\wd ~\tg N-1A1s~\lu God`
function word({ tag, value }: { tag: string, value: string }) {
	return `~\\wd ~\\tg ${tag}~\\lu ${value}`
}

function target_word({ tag, value, target }: { tag: string, value: string, target: string }) {
	return `${word({ tag, value })}~\\z1 ${target}`
}

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => undefined)
})

afterEach(() => {
	vi.restoreAllMocks()
	vi.unstubAllGlobals()
})

describe('transform_semantic_encoding', () => {
	it("decodes a word's category, concept and features", async () => {
		const [god] = await transform_semantic_encoding({ db, semantic_encoding: word({ tag: 'N-1A1s', value: 'God' }) })

		expect(god).toMatchObject({
			category: 'Noun',
			category_abbr: 'N',
			value: 'God',
			concept: { stem: 'God', sense: 'A', part_of_speech: 'Noun' },
			noun_list_index: '1',
			feature_codes: 's',
			features: [{ name: 'Number', value: 'Singular' }],
		})
	})

	it('decodes boundaries with no concept, in the order they appear', async () => {
		const encoding = [
			word({ tag: 'c-I', value: '{' }),
			word({ tag: 'N-1A1s', value: 'God' }),
			word({ tag: 'R-', value: 'Paragraph' }),
		].join('')

		const entities = await transform_semantic_encoding({ db, semantic_encoding: encoding })

		expect(entities.map(({ category, value }) => ({ category, value }))).toEqual([
			{ category: 'Clause', value: '{' },
			{ category: 'Noun', value: 'God' },
			{ category: 'Format Marker', value: 'Paragraph' },
		])
		expect(entities[0].concept).toBeNull()
	})

	it('splits a paired concept into its two halves with the pairing type', async () => {
		const [follower, literal] = await transform_semantic_encoding({
			db,
			semantic_encoding: word({ tag: 'N-1A1s', value: 'follower/Adisciple' }) + word({ tag: 'V-1Au', value: 'take\\Bgrasp' }),
		})

		expect(follower.concept).toMatchObject({ stem: 'follower', sense: 'A' })
		expect(follower.pairing_concept).toMatchObject({ stem: 'disciple', sense: 'A' })
		expect(follower.pairing_type).toBe('simple-complex')
		expect(literal.pairing_type).toBe('dynamic-literal')
	})

	it('treats a word with no tag as having no category', async () => {
		const [entity] = await transform_semantic_encoding({ db, semantic_encoding: '~\\wd ~\\tg ~\\lu )' })

		expect(entity).toMatchObject({ category: '', value: ')', feature_codes: '', features: [] })
	})

	it('finds nothing in text that has no encoded words', async () => {
		expect(await transform_semantic_encoding({ db, semantic_encoding: 'just prose' })).toEqual([])
	})
})

describe('transform_target_encoding', () => {
	beforeEach(() => {
		// A blank project never reaches the targets API, so the source features are the only ones used
		vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('no network in unit tests') }))
	})

	it('decodes a word with its target text', async () => {
		const [god] = await transform_target_encoding({
			db,
			project: '',
			semantic_encoding: target_word({ tag: 'N-1A1s', value: 'God', target: 'Allah' }),
		})

		expect(god).toMatchObject({
			category: 'Noun',
			value: 'God',
			target: 'Allah',
			concept: { stem: 'God', sense: 'A', part_of_speech: 'Noun' },
			noun_list_index: '1',
			features: [{ name: 'Number', value: 'Singular' }],
		})
	})

	it(`reads a paragraph's target as "Paragraph"`, async () => {
		const [paragraph] = await transform_target_encoding({
			db,
			project: '',
			semantic_encoding: target_word({ tag: 'R-', value: 'Paragraph', target: '|' }),
		})

		expect(paragraph.target).toBe('Paragraph')
	})

	it('keeps a user-defined "&" category as given, with no features', async () => {
		const [entity] = await transform_target_encoding({
			db,
			project: '',
			semantic_encoding: '~\\wd ~\\tg &Custom~\\lu hello~\\z1 hola',
		})

		expect(entity).toMatchObject({ category: 'Custom', category_abbr: 'Custom', features: [], target: 'hola' })
	})

	it('leaves the target empty when a word has none', async () => {
		const [entity] = await transform_target_encoding({
			db,
			project: '',
			semantic_encoding: `${word({ tag: 'N-1A1s', value: 'God' })}~\\z1`,
		})

		expect(entity.target).toBe('')
	})
})
