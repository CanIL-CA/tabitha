/**
 * The 66 books of the Bible, in canonical order, keyed by book number.
 *
 * Because all keys are integer-like, `Object.keys`/`Object.values` always iterate them in
 * ascending numeric order regardless of literal insertion order (per the ECMAScript spec for
 * integer-index property keys) -- so consumers can rely on `Object.values(BIBLE_BOOKS)` for a
 * book-ordered array without needing to sort it.
 */
export const BIBLE_BOOKS: Record<number, string> = {
	1: 'Genesis',
	2: 'Exodus',
	3: 'Leviticus',
	4: 'Numbers',
	5: 'Deuteronomy',
	6: 'Joshua',
	7: 'Judges',
	8: 'Ruth',
	9: '1 Samuel',
	10: '2 Samuel',
	11: '1 Kings',
	12: '2 Kings',
	13: '1 Chronicles',
	14: '2 Chronicles',
	15: 'Ezra',
	16: 'Nehemiah',
	17: 'Esther',
	18: 'Job',
	19: 'Psalms',
	20: 'Proverbs',
	21: 'Ecclesiastes',
	22: 'Song of Solomon',
	23: 'Isaiah',
	24: 'Jeremiah',
	25: 'Lamentations',
	26: 'Ezekiel',
	27: 'Daniel',
	28: 'Hosea',
	29: 'Joel',
	30: 'Amos',
	31: 'Obadiah',
	32: 'Jonah',
	33: 'Micah',
	34: 'Nahum',
	35: 'Habakkuk',
	36: 'Zephaniah',
	37: 'Haggai',
	38: 'Zechariah',
	39: 'Malachi',
	40: 'Matthew',
	41: 'Mark',
	42: 'Luke',
	43: 'John',
	44: 'Acts',
	45: 'Romans',
	46: '1 Corinthians',
	47: '2 Corinthians',
	48: 'Galatians',
	49: 'Ephesians',
	50: 'Philippians',
	51: 'Colossians',
	52: '1 Thessalonians',
	53: '2 Thessalonians',
	54: '1 Timothy',
	55: '2 Timothy',
	56: 'Titus',
	57: 'Philemon',
	58: 'Hebrews',
	59: 'James',
	60: '1 Peter',
	61: '2 Peter',
	62: '1 John',
	63: '2 John',
	64: '3 John',
	65: 'Jude',
	66: 'Revelation',
}

const BOOK_ORDER = new Map(Object.values(BIBLE_BOOKS).map((book, index) => [book, index]))

/**
 * USFM book codes keyed by the canonical book name -- the same names as `BIBLE_BOOKS`, which is
 * what our own services expect as a reference's `id_primary`.
 *
 * Note `Song of Solomon`, not the `Song of Songs` spelling some external sources use: the Sources
 * API only resolves the former, so keying on anything else silently yields no match.
 */
export const USFM_BOOK_CODES: Record<string, string> = {
	'Genesis': 'GEN',
	'Exodus': 'EXO',
	'Leviticus': 'LEV',
	'Numbers': 'NUM',
	'Deuteronomy': 'DEU',
	'Joshua': 'JOS',
	'Judges': 'JDG',
	'Ruth': 'RUT',
	'1 Samuel': '1SA',
	'2 Samuel': '2SA',
	'1 Kings': '1KI',
	'2 Kings': '2KI',
	'1 Chronicles': '1CH',
	'2 Chronicles': '2CH',
	'Ezra': 'EZR',
	'Nehemiah': 'NEH',
	'Esther': 'EST',
	'Job': 'JOB',
	'Psalms': 'PSA',
	'Proverbs': 'PRO',
	'Ecclesiastes': 'ECC',
	'Song of Solomon': 'SNG',
	'Isaiah': 'ISA',
	'Jeremiah': 'JER',
	'Lamentations': 'LAM',
	'Ezekiel': 'EZK',
	'Daniel': 'DAN',
	'Hosea': 'HOS',
	'Joel': 'JOL',
	'Amos': 'AMO',
	'Obadiah': 'OBA',
	'Jonah': 'JON',
	'Micah': 'MIC',
	'Nahum': 'NAM',
	'Habakkuk': 'HAB',
	'Zephaniah': 'ZEP',
	'Haggai': 'HAG',
	'Zechariah': 'ZEC',
	'Malachi': 'MAL',
	'Matthew': 'MAT',
	'Mark': 'MRK',
	'Luke': 'LUK',
	'John': 'JHN',
	'Acts': 'ACT',
	'Romans': 'ROM',
	'1 Corinthians': '1CO',
	'2 Corinthians': '2CO',
	'Galatians': 'GAL',
	'Ephesians': 'EPH',
	'Philippians': 'PHP',
	'Colossians': 'COL',
	'1 Thessalonians': '1TH',
	'2 Thessalonians': '2TH',
	'1 Timothy': '1TI',
	'2 Timothy': '2TI',
	'Titus': 'TIT',
	'Philemon': 'PHM',
	'Hebrews': 'HEB',
	'James': 'JAS',
	'1 Peter': '1PE',
	'2 Peter': '2PE',
	'1 John': '1JN',
	'2 John': '2JN',
	'3 John': '3JN',
	'Jude': 'JUD',
	'Revelation': 'REV',
}

/**
 * The inverse of `USFM_BOOK_CODES`, derived rather than written out so the two cannot drift.
 *
 * External scripture APIs identify books by USFM code, so an incoming reference has to be
 * translated back to the canonical name before it can be looked up in our own services.
 */
export const BOOK_NAME_BY_USFM_CODE: Record<string, string> = Object.fromEntries(
	Object.entries(USFM_BOOK_CODES).map(([book_name, code]) => [code, book_name]),
)

/**
 * A reference's position in Bible book order, or -1 for a book that isn't one of the 66, so
 * `(a, b) => book_order_index(a) - book_order_index(b)` sorts by book order rather than the
 * natural alphabetical order.
 */
export function book_order_index({ reference }: {
	reference: { id_primary: string }
}): number {
	return BOOK_ORDER.get(reference.id_primary) ?? -1
}

const OLD_TESTAMENT_BOOK_COUNT = 39

/**
 * Returns which testament a canonical Bible book belongs to, or `undefined` if the name
 * isn't one of the 66 books in `BIBLE_BOOKS`.
 */
export function testament(book_name: string): 'Old Testament' | 'New Testament' | undefined {
	const index = BOOK_ORDER.get(book_name)

	if (index === undefined) {
		return undefined
	}

	return index < OLD_TESTAMENT_BOOK_COUNT ? 'Old Testament' : 'New Testament'
}

/**
 * Matches USFM verse marker tokens (e.g. `\v 14`, `\v  1`).
 *
 * @example
 * Positive: "\\v 1", "\\v 14", "\\v   22"
 * Negative: "\\c 1", "v 14", "verse 1"
 */
export const USFM_VERSE_MARKER_REGEX = /\\v\s+\d+/g
