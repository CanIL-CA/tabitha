import { describe, expect, it } from 'vitest'
import type { D1DatabaseSession } from '@cloudflare/workers-types'
import type { DbRowText } from '#lib/types.js'
import { parse_search_query, search_text } from './search'

// The Text table's answer to whatever was asked; the SQL itself is D1's job
function fake_db(rows: readonly DbRowText[] | null): D1DatabaseSession {
	return {
		prepare: () => ({ bind: () => ({ all: async () => ({ results: rows }) }) }),
	} as unknown as D1DatabaseSession
}

function text_row({ book = 'Luke', chapter = 1, verse = 1, audience = 'Unchurched Adults', text = 'text' }: Partial<DbRowText>): DbRowText {
	return { book, chapter, verse, audience, text }
}

describe('search_text', () => {
	it('finds nothing for an empty query, without needing the database', async () => {
		const db = fake_db([text_row({})])

		expect(await search_text({ db, project: 'English', parsed_q: parse_search_query('') })).toEqual([])
		expect(await search_text({ db, project: 'English', parsed_q: { or_terms: [] } })).toEqual([])
	})

	it('gathers every audience\'s text for a verse into one result with its reference', async () => {
		const db = fake_db([
			text_row({ book: 'Luke', chapter: 2, verse: 3, audience: 'Unchurched Adults', text: 'a' }),
			text_row({ book: 'Luke', chapter: 2, verse: 3, audience: 'Church Adults', text: 'b' }),
		])

		const results = await search_text({ db, project: 'English', parsed_q: parse_search_query('word') })

		expect(results).toEqual([{
			reference: { type: 'Bible', id_primary: 'Luke', id_secondary: '2', id_tertiary: '3' },
			texts: [
				{ text: 'a', audience: 'Unchurched Adults' },
				{ text: 'b', audience: 'Church Adults' },
			],
		}])
	})

	it('keeps verses apart, one result each', async () => {
		const db = fake_db([text_row({ verse: 1 }), text_row({ verse: 2 }), text_row({ book: 'Acts', verse: 1 })])

		const results = await search_text({ db, project: 'English', parsed_q: parse_search_query('word') })

		expect(results.map(({ reference }) => `${reference.id_primary} ${reference.id_tertiary}`).toSorted()).toEqual(['Acts 1', 'Luke 1', 'Luke 2'])
	})

	it('finds nothing when the database returns no results', async () => {
		expect(await search_text({ db: fake_db(null), project: 'English', parsed_q: parse_search_query('word') })).toEqual([])
		expect(await search_text({ db: fake_db([]), project: 'English', parsed_q: parse_search_query('word') })).toEqual([])
	})
})
