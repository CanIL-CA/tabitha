import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Reference } from '@tabitha/types'
import { run_phrase_mode } from './phrase_mode'

const SOURCES_HOST = 'https://sources.test'

// What API.Bible's search returns for a verse; `reference` is "Matthew 3:<verse>"
function api_bible_verse(verse_number: number) {
	return { bookId: 'MAT', chapterId: 'MAT.3', reference: `Matthew 3:${verse_number}`, text: `repent, verse ${verse_number}` }
}

// Stands in for the two services run_phrase_mode talks to: API.Bible, and Sources answering
// from the set of verses it holds an encoding for
function stub_services({ verses, encoded_verses = [], api_bible_status = 200 }: {
	readonly verses: readonly ReturnType<typeof api_bible_verse>[]
	readonly encoded_verses?: readonly string[]
	readonly api_bible_status?: number
}) {
	vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
		if (new URL(input).origin === new URL(SOURCES_HOST).origin) {
			const references: Reference[] = JSON.parse(init?.body as string)
			return Response.json(references.map(reference => ({ reference, has_encoding: encoded_verses.includes(reference.id_tertiary) })))
		}
		return Response.json({ data: { total: verses.length, verses }, meta: { fumsToken: 'fums-1' } }, { status: api_bible_status })
	}))
}

function run({ project = 'English', api_key = 'key' }: { project?: 'English' | 'Tagalog', api_key?: string } = {}) {
	return run_phrase_mode({ phrase: 'repent', project, api_key, sources_api_host: SOURCES_HOST })
}

afterEach(() => {
	vi.unstubAllGlobals()
})

describe('run_phrase_mode', () => {
	it('keeps only the matching verses that have an encoding, and passes on the FUMS token', async () => {
		stub_services({ verses: [api_bible_verse(1), api_bible_verse(2), api_bible_verse(3)], encoded_verses: ['1', '3'] })

		const result = await run()

		expect(result.hits.map(({ reference }) => reference.id_tertiary)).toEqual(['1', '3'])
		expect(result).toMatchObject({ complete: true, fums_token: 'fums-1', notice: null })
	})

	it('has no hits when none of the matching verses is encoded', async () => {
		stub_services({ verses: [api_bible_verse(1)], encoded_verses: [] })

		expect(await run()).toMatchObject({ hits: [], notice: null })
	})

	it('has no hits, and no notice, when the phrase matches no verses', async () => {
		stub_services({ verses: [] })

		expect(await run()).toMatchObject({ hits: [], complete: true, notice: null })
	})

	it('explains a project with no Bible to search', async () => {
		expect(await run({ project: 'Tagalog' })).toEqual({ hits: [], complete: true, fums_token: null, notice: 'unsupported_project' })
	})

	it('explains an unconfigured search service', async () => {
		expect(await run({ api_key: '' })).toMatchObject({ hits: [], notice: 'unavailable' })
	})

	it('explains a search service that rejects the request', async () => {
		stub_services({ verses: [], api_bible_status: 500 })

		expect(await run()).toMatchObject({ hits: [], notice: 'unavailable' })
	})
})
