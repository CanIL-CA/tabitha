import { BOOK_NAME_BY_USFM_CODE } from '@tabitha/types/patterns'
import type { Reference, TargetProject } from '@tabitha/types'
import type { PhraseMatch, PhraseSearchOutcome } from '#lib/types.js'

const API_BIBLE_BASE = 'https://api.scripture.api.bible/v1'

/**
 * API.Bible caps `limit` at 200 and silently truncates anything larger rather than erroring,
 * so asking for more just wastes the round trip.
 */
const MAX_PAGE_SIZE = 200

/**
 * How many pages we're willing to walk before giving up and reporting an incomplete result.
 *
 * A common set of words can match thousands of verses; this bounds that cost. The UI tells the
 * user when a search hit the ceiling.
 */
const MAX_PAGES = 5

/**
 * The Bible each target-language project is searched against.
 *
 * Deliberately `Partial`: `Tagalog` is a valid `TargetProject` with no counterpart on our
 * API.Bible account, so the absence is part of the type rather than a runtime surprise.
 */
const BIBLE_ID_BY_PROJECT: Partial<Record<TargetProject, string>> = {
	English: '78a9f6124f344018-01',    // New International Version 2011
	Swahili: '611f8eb23aec8f13-01',    // Biblica Open Kiswahili Contemporary Version (Neno)
	Indonesian: '2dd568eeff29fb3c-02', // Plain Indonesian Translation (62 of 66 books)
}

/**
 * A short, recognizable label for the Bible each project searches, for crediting the source of a
 * reference-search result's text in the UI -- kept independent of the id map above since a
 * display label and an API identifier can drift for unrelated reasons.
 */
export const BIBLE_NAME_BY_PROJECT: Partial<Record<TargetProject, string>> = {
	English: 'NIV',
	Swahili: 'Neno',
	Indonesian: 'TSI',
}

type ApiBibleVerse = {
	bookId: string
	chapterId: string
	reference: string
	text: string
}

/**
 * Straight and curly double-quote pairs a phrase can be wrapped in to ask for an exact match,
 * mirroring how a browser or OS autocorrects a typed `"` into a curly one.
 */
const QUOTE_PAIRS: [string, string][] = [
	['"', '"'],
	['“', '”'],
]

/**
 * Pulls the inner text out of a quote-wrapped phrase (Google-style exact-phrase syntax), or
 * `null` if `phrase` isn't wrapped in one of `QUOTE_PAIRS`.
 */
export function extract_exact_phrase(phrase: string): string | null {
	const trimmed = phrase.trim()

	for (const [open, close] of QUOTE_PAIRS) {
		if (trimmed.length > open.length + close.length && trimmed.startsWith(open) && trimmed.endsWith(close)) {
			return trimmed.slice(open.length, -close.length)
		}
	}

	return null
}

/**
 * Folds away the differences that shouldn't defeat a phrase match: case, runs of whitespace,
 * and the curly quotes publishers use where a person types straight ones.
 */
export function normalize_for_match(text: string): string {
	return text
		.toLowerCase()
		.replaceAll(/[‘’]/g, "'")
		.replaceAll(/[“”]/g, '"')
		.replaceAll(/\s+/g, ' ')
		.trim()
}

type ApiBibleSearchResponse = {
	data?: {
		total?: number
		verses?: ApiBibleVerse[]
	}
	meta?: {
		fumsToken?: string
	}
}

/**
 * Translates an API.Bible verse into a reference our own services can resolve.
 *
 * Their `bookId` is a USFM code (`MAT`); Sources and Targets both key on the canonical book
 * name (`Matthew`), and `chapterId` arrives as `MAT.3` rather than a bare number.
 */
export function to_reference(verse: ApiBibleVerse): Reference | null {
	const book = BOOK_NAME_BY_USFM_CODE[verse.bookId]

	if (!book) {
		return null
	}

	const [, chapter, verse_number] = verse.reference.match(/(\d+):(\d+)/) ?? []

	if (!chapter || !verse_number) {
		return null
	}

	return {
		type: 'Bible',
		id_primary: book,
		id_secondary: chapter,
		id_tertiary: verse_number,
	}
}

function build_search_url({ bible_id, phrase, offset }: {
	bible_id: string
	phrase: string
	offset: number
}): string {
	const params = new URLSearchParams({
		query: phrase,
		limit: MAX_PAGE_SIZE.toString(),
		offset: offset.toString(),
		// their default is AUTO, which tolerates typos -- we want the words the user actually typed
		fuzziness: '0',
		'fums-version': '3',
	})

	return `${API_BIBLE_BASE}/bibles/${bible_id}/search?${params}`
}

/**
 * Finds the verses matching `phrase` in the Bible that backs `project`.
 *
 * Quote-wrapping `phrase` (`"kingdom of heaven"`, straight or curly) asks for an exact match:
 * API.Bible's own quote handling still lets scattered near-misses through (verified against a
 * real search -- 14 of 45 "quoted" results didn't contain the phrase as literally typed), so
 * quotes are stripped before the request and the exact match is enforced ourselves against
 * whatever API.Bible returns. Unquoted, every word just needs to be present somewhere in the
 * verse, any order, any distance apart -- whatever API.Bible itself considers a match.
 *
 * Returns a discriminated outcome rather than throwing: a project we have no Bible for, and an
 * upstream that's unreachable or unconfigured, are both ordinary things for the page to explain
 * rather than errors worth an error page.
 */
export async function search_phrase({ phrase, project, api_key, fetch_fn = fetch }: {
	phrase: string
	project: TargetProject
	api_key: string
	fetch_fn?: typeof fetch
}): Promise<PhraseSearchOutcome> {
	const bible_id = BIBLE_ID_BY_PROJECT[project]

	if (!bible_id) {
		return { kind: 'unsupported_project', project }
	}

	if (!api_key) {
		return { kind: 'unavailable' }
	}

	const exact_phrase = extract_exact_phrase(phrase)
	const query_phrase = exact_phrase ?? phrase
	const needle = exact_phrase ? normalize_for_match(exact_phrase) : null
	const source_label = BIBLE_NAME_BY_PROJECT[project] ?? null

	const matches: PhraseMatch[] = []
	let fums_token: string | null = null
	let total = 0
	let pages_read = 0

	while (pages_read < MAX_PAGES) {
		const url = build_search_url({ bible_id, phrase: query_phrase, offset: pages_read * MAX_PAGE_SIZE })
		const response = await fetch_fn(url, { headers: { 'api-key': api_key } })

		if (!response.ok) {
			return { kind: 'unavailable' }
		}

		const body: ApiBibleSearchResponse = await response.json()
		const verses = body.data?.verses ?? []

		fums_token = body.meta?.fumsToken ?? fums_token
		total = body.data?.total ?? 0
		pages_read += 1

		for (const verse of verses) {
			if (needle && !normalize_for_match(verse.text).includes(needle)) {
				continue
			}

			const reference = to_reference(verse)

			if (reference) {
				matches.push({ reference, text: verse.text, source_label })
			}
		}

		if (verses.length < MAX_PAGE_SIZE) {
			return { kind: 'ok', matches, complete: true, fums_token }
		}
	}

	return { kind: 'ok', matches, complete: pages_read * MAX_PAGE_SIZE >= total, fums_token }
}
