import type { D1Database } from '@cloudflare/workers-types'
import { book_order_index } from '@tabitha/types/patterns'
import type { SourceStatus } from '@tabitha/types'
import type { Phase1SearchResults, MatchSegment } from '#lib/types.js'

/**
 * Common words can match most of the Bible; beyond this many hits a list stops being useful to
 * read, so the page shows the first ones in book order and reports the total.
 */
export const MAX_HITS = 500

/**
 * A quoted run of text (straight or curly quotes) is one exact phrase; anything else splits on
 * whitespace into individual words.
 */
const TERM_REGEX = /["“]([^"”]+)["”]|(\S+)/g

/**
 * Splits a query into the terms every matching verse has to contain: each bare word is its own
 * term, each quoted phrase stays whole.
 */
export function parse_phase_1_query(q: string): string[] {
	return [...q.matchAll(TERM_REGEX)]
		.map(([, phrase, word]) => (phrase ?? word).trim().replaceAll(/\s+/g, ' '))
		.filter(term => term.length > 0)
}

const escape_regex = (text: string): string => text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')

const LIKE_ESCAPE_CHAR = '\\'

const escape_like = (text: string): string => text.replaceAll(/[\\%_]/g, `${LIKE_ESCAPE_CHAR}$&`)

/**
 * Matches a term only as whole words (so "love" doesn't match "beloved"), case-insensitively,
 * tolerating any run of whitespace between a phrase's words.
 */
export function to_term_regex(term: string): RegExp {
	const words_pattern = term.split(' ').map(escape_regex).join('\\s+')
	return new RegExp(`(?<![\\p{L}\\p{N}])${words_pattern}(?![\\p{L}\\p{N}])`, 'giu')
}

/**
 * Splits text into alternating plain and matched runs so the UI can highlight every occurrence
 * of every term without re-deriving the matching rules.
 */
export function to_match_segments({ text, terms }: { text: string, terms: string[] }): MatchSegment[] {
	const ranges = terms
		.flatMap(term => [...text.matchAll(to_term_regex(term))].map(match => [match.index, match.index + match[0].length]))
		.sort(([a_start], [b_start]) => a_start - b_start)

	const merged_ranges = ranges.reduce<number[][]>((merged, [start, end]) => {
		const last = merged.at(-1)
		if (last && start <= last[1]) {
			last[1] = Math.max(last[1], end)
			return merged
		}
		return [...merged, [start, end]]
	}, [])

	const segments: MatchSegment[] = []
	let cursor = 0
	for (const [start, end] of merged_ranges) {
		segments.push({ text: text.slice(cursor, start), is_match: false })
		segments.push({ text: text.slice(start, end), is_match: true })
		cursor = end
	}
	segments.push({ text: text.slice(cursor), is_match: false })

	return segments.filter(segment => segment.text.length > 0)
}

type DbPhase1Row = {
	id_primary: string
	id_secondary: string
	id_tertiary: string
	phase_1_encoding: string
	status: SourceStatus | ''
}

/**
 * Finds every Bible verse whose Phase 1 encoding contains all of the query's terms as whole
 * words, in canonical order.
 *
 * SQL `LIKE` only narrows the candidates -- D1 has no regex support, and `LIKE` can't tell a
 * whole word from part of one -- so the whole-word check runs here on what comes back.
 */
export async function search_phase_1({ db, q }: { db: D1Database, q: string }): Promise<Phase1SearchResults> {
	const terms = parse_phase_1_query(q)
	if (!terms.length) return { terms, hits: [], total_count: 0 }

	const like_values = terms.flatMap(term => term.split(' ')).map(word => `%${escape_like(word)}%`)
	const like_conditions = like_values.map(() => `phase_1_encoding LIKE ? ESCAPE '${LIKE_ESCAPE_CHAR}'`).join(' AND ')

	const sql = `
		SELECT id_primary, id_secondary, id_tertiary, phase_1_encoding, status
		FROM Sources
		WHERE type = 'Bible'
			AND ${like_conditions}
	`

	const { results } = await db.prepare(sql).bind(...like_values).all<DbPhase1Row>()

	const term_regexes = terms.map(to_term_regex)
	const contains_every_term = (text: string): boolean => term_regexes.every(regex => text.search(regex) >= 0)

	const hits = results
		.filter(row => contains_every_term(row.phase_1_encoding))
		.map(row => ({
			reference: { type: 'Bible', id_primary: row.id_primary, id_secondary: row.id_secondary, id_tertiary: row.id_tertiary },
			status: row.status || 'Not Started',
			segments: to_match_segments({ text: row.phase_1_encoding, terms }),
		}))
		.sort((a, b) =>
			book_order_index(a) - book_order_index(b)
			|| Number(a.reference.id_secondary) - Number(b.reference.id_secondary)
			|| Number(a.reference.id_tertiary) - Number(b.reference.id_tertiary))

	return {
		terms,
		hits: hits.slice(0, MAX_HITS),
		total_count: hits.length,
	}
}
