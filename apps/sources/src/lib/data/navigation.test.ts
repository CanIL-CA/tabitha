import { describe, expect, it, vi } from 'vitest'
import type { D1DatabaseSession } from '@cloudflare/workers-types'
import type { Reference } from '@tabitha/types'

// 'Bible/Genesis/1/1' reads as type/primary/secondary/tertiary
function verse(path: string): Reference {
	const [type, id_primary, id_secondary, id_tertiary] = path.split('/')
	return { type, id_primary, id_secondary, id_tertiary } as Reference
}

// A small corpus standing in for the Sources table: enough of the Bible to cross chapter, book and
// testament boundaries, and an ordered non-Bible type with no canonical book order
const CORPUS: Reference[] = [
	'Bible/Genesis/1/1',
	'Bible/Genesis/1/2',
	'Bible/Genesis/2/1',
	'Bible/Malachi/4/1',
	'Bible/Malachi/4/6',
	'Bible/Matthew/1/1',
	'Bible/Matthew/1/2',
	'Bible/Revelation/22/1',
	'Bible/Revelation/22/2',
	'Grammar Introduction/Nouns/1/1',
	'Grammar Introduction/Nouns/3/5',
	'Grammar Introduction/Verbs/1/1',
	'Grammar Introduction/Adjectives/1/1',
].map(verse)

// The read layer is the database boundary, so it's replaced by one that answers from the corpus
vi.mock('./read', () => {
	const same = ({ a, b }: { a: string, b: string }) => a.toLowerCase() === b.toLowerCase()
	const unique = <T>(values: T[]): T[] => [...new Set(values)]
	return {
		get_primary_ids: async ({ type }: { type: string }) =>
			unique(CORPUS.filter(v => same({ a: v.type, b: type })).map(v => v.id_primary)).map(id_primary => ({ id_primary })),
		get_secondary_ids: async ({ type, id_primary }: { type: string, id_primary: string }) =>
			unique(CORPUS.filter(v => same({ a: v.type, b: type }) && same({ a: v.id_primary, b: id_primary })).map(v => v.id_secondary)).map(id_secondary => ({ id_secondary })),
		get_tertiary_ids: async ({ type, id_primary, id_secondary }: { type: string, id_primary: string, id_secondary: string }) =>
			unique(CORPUS.filter(v => same({ a: v.type, b: type }) && same({ a: v.id_primary, b: id_primary }) && v.id_secondary === id_secondary).map(v => v.id_tertiary)).map(id_tertiary => ({ id_tertiary })),
		get_source_data: async (reference: Reference) =>
			CORPUS.find(v => same({ a: v.type, b: reference.type }) && same({ a: v.id_primary, b: reference.id_primary }) && v.id_secondary === reference.id_secondary && v.id_tertiary === reference.id_tertiary) ?? null,
	}
})

const { get_previous_reference, get_next_reference } = await import('./navigation')

const db = {} as D1DatabaseSession

describe('get_previous_reference', () => {
	it('returns null when already at the very first verse of the Bible', async () => {
		expect(await get_previous_reference({ db, reference: verse('Bible/Genesis/1/1') })).toBeNull()
	})

	it('steps back within a chapter', async () => {
		expect(await get_previous_reference({ db, reference: verse('Bible/Genesis/1/2') })).toEqual(verse('Bible/Genesis/1/1'))
	})

	it('crosses a chapter boundary, landing on the previous chapter\'s last verse', async () => {
		expect(await get_previous_reference({ db, reference: verse('Bible/Genesis/2/1') })).toEqual(verse('Bible/Genesis/1/2'))
	})

	it('crosses a book boundary, landing on the previous book\'s last chapter and verse', async () => {
		expect(await get_previous_reference({ db, reference: verse('Bible/Matthew/1/1') })).toEqual(verse('Bible/Malachi/4/6'))
	})

	it('crosses a primary-id boundary for a non-Bible type, in the order the type\'s ids are stored', async () => {
		expect(await get_previous_reference({ db, reference: verse('Grammar Introduction/Verbs/1/1') }))
			.toEqual(verse('Grammar Introduction/Nouns/3/5'))
	})

	it('returns null at the first primary id of a non-Bible type', async () => {
		expect(await get_previous_reference({ db, reference: verse('Grammar Introduction/Nouns/1/1') })).toBeNull()
	})
})

describe('get_next_reference', () => {
	it('returns null when already at the very last verse in the corpus', async () => {
		expect(await get_next_reference({ db, reference: verse('Bible/Revelation/22/2') })).toBeNull()
	})

	it('steps forward within a chapter', async () => {
		expect(await get_next_reference({ db, reference: verse('Bible/Genesis/1/1') })).toEqual(verse('Bible/Genesis/1/2'))
	})

	it('crosses a chapter boundary to the next chapter\'s first verse', async () => {
		expect(await get_next_reference({ db, reference: verse('Bible/Genesis/1/2') })).toEqual(verse('Bible/Genesis/2/1'))
	})

	it('crosses the Old Testament / New Testament seam from Malachi into Matthew', async () => {
		expect(await get_next_reference({ db, reference: verse('Bible/Malachi/4/6') })).toEqual(verse('Bible/Matthew/1/1'))
	})

	it('crosses a primary-id boundary for a non-Bible type, in the order the type\'s ids are stored', async () => {
		expect(await get_next_reference({ db, reference: verse('Grammar Introduction/Nouns/3/5') }))
			.toEqual(verse('Grammar Introduction/Verbs/1/1'))
	})

	it('returns null at the last primary id of a non-Bible type', async () => {
		expect(await get_next_reference({ db, reference: verse('Grammar Introduction/Adjectives/1/1') })).toBeNull()
	})
})
