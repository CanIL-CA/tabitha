import { describe, expect, it, vi } from 'vitest'
import type { D1Database } from '@cloudflare/workers-types'
import { MAX_HITS, parse_phase_1_query, search_phase_1, to_match_segments } from './phase_1_search'

type Row = { id_primary: string, id_secondary: string, id_tertiary: string, phase_1_encoding: string, status: string }

const row = ({ reference, phase_1_encoding, status = 'Ready to Translate' }: {
	reference: string
	phase_1_encoding: string
	status?: string
}): Row => {
	const [, id_primary, id_secondary, id_tertiary] = /(.*) (\d+):(\d+)/.exec(reference)!
	return { id_primary, id_secondary, id_tertiary, phase_1_encoding, status }
}

const fake_db = (rows: Row[]) => {
	const bind = vi.fn(() => ({ all: async () => ({ results: rows }) }))
	const prepare = vi.fn(() => ({ bind }))
	return { db: { prepare } as unknown as D1Database, prepare, bind }
}

describe('parse_phase_1_query', () => {
	it('splits bare words into separate terms', () => {
		expect(parse_phase_1_query('  God   loved ')).toEqual(['God', 'loved'])
	})

	it('keeps a quoted phrase whole, collapsing inner whitespace', () => {
		expect(parse_phase_1_query('"the  people of Israel" king')).toEqual(['the people of Israel', 'king'])
	})

	it('accepts curly quotes', () => {
		expect(parse_phase_1_query('“son of man”')).toEqual(['son of man'])
	})

	it('returns no terms for blank input', () => {
		expect(parse_phase_1_query('   ')).toEqual([])
	})
})

describe('to_match_segments', () => {
	it('marks each whole-word occurrence, case-insensitively', () => {
		expect(to_match_segments({ text: 'God loved his beloved people. god', terms: ['god', 'loved'] })).toEqual([
			{ text: 'God', is_match: true },
			{ text: ' ', is_match: false },
			{ text: 'loved', is_match: true },
			{ text: ' his beloved people. ', is_match: false },
			{ text: 'god', is_match: true },
		])
	})

	it('merges overlapping matches into one highlighted run', () => {
		expect(to_match_segments({ text: 'the son of man came', terms: ['son of man', 'man'] })).toEqual([
			{ text: 'the ', is_match: false },
			{ text: 'son of man', is_match: true },
			{ text: ' came', is_match: false },
		])
	})

	it('treats regex characters in a term literally', () => {
		expect(to_match_segments({ text: 'a (king) spoke', terms: ['(king)'] })).toEqual([
			{ text: 'a ', is_match: false },
			{ text: '(king)', is_match: true },
			{ text: ' spoke', is_match: false },
		])
	})
})

describe('search_phase_1', () => {
	it('skips the database entirely for a blank query', async () => {
		const { db, prepare } = fake_db([])

		expect(await search_phase_1({ db, q: ' ' })).toEqual({ terms: [], hits: [], total_count: 0 })
		expect(prepare).not.toHaveBeenCalled()
	})

	it('binds one escaped LIKE pattern per word, phrase words included', async () => {
		const { db, bind } = fake_db([])

		await search_phase_1({ db, q: '"son of" 100%' })

		expect(bind).toHaveBeenCalledWith('%son%', '%of%', '%100\\%%')
	})

	it('drops candidates that only contain a term inside a longer word', async () => {
		const { db } = fake_db([
			row({ reference: 'John 3:16', phase_1_encoding: 'God loved the people of the world.' }),
			row({ reference: 'Mark 1:11', phase_1_encoding: 'You are my beloved son.' }),
		])

		const { hits } = await search_phase_1({ db, q: 'loved' })

		expect(hits.map(hit => hit.reference.id_primary)).toEqual(['John'])
	})

	it('requires a quoted phrase to appear in order', async () => {
		const { db } = fake_db([
			row({ reference: 'Genesis 1:1', phase_1_encoding: 'God made the heavens and the earth.' }),
			row({ reference: 'Genesis 1:2', phase_1_encoding: 'The earth and the heavens were empty.' }),
		])

		const { hits } = await search_phase_1({ db, q: '"the heavens and the earth"' })

		expect(hits.map(hit => hit.reference.id_tertiary)).toEqual(['1'])
	})

	it('sorts hits in canonical order and defaults a blank status to Not Started', async () => {
		const { db } = fake_db([
			row({ reference: 'John 1:10', phase_1_encoding: 'God x' }),
			row({ reference: 'Genesis 2:1', phase_1_encoding: 'God x', status: '' }),
			row({ reference: 'John 1:9', phase_1_encoding: 'God x' }),
		])

		const { hits } = await search_phase_1({ db, q: 'God' })

		expect(hits.map(({ reference: { id_primary, id_secondary, id_tertiary } }) => `${id_primary} ${id_secondary}:${id_tertiary}`))
			.toEqual(['Genesis 2:1', 'John 1:9', 'John 1:10'])
		expect(hits[0].status).toBe('Not Started')
	})

	it('caps the hits returned but reports the full count', async () => {
		const rows = Array.from({ length: MAX_HITS + 5 }, (_, index) => row({ reference: `Psalms 1:${index + 1}`, phase_1_encoding: 'God x' }))
		const { db } = fake_db(rows)

		const { hits, total_count } = await search_phase_1({ db, q: 'God' })

		expect(hits).toHaveLength(MAX_HITS)
		expect(total_count).toBe(MAX_HITS + 5)
	})
})
