import { describe, expect, test } from 'vitest'
import {
	strip_jsonc_comments,
	is_iso_date,
	CONCEPT_SENSE_REGEX,
	CONCEPT_KEY_REGEX,
	normalize_wildcards,
	parse_concept_sense,
	parse_concept_key,
	USFM_VERSE_MARKER_REGEX,
	strip_gloss_classifiers,
	BIBLE_BOOKS,
	USFM_BOOK_CODES,
	BOOK_NAME_BY_USFM_CODE,
	by_book_order,
	clean_trailing_slash,
	testament,
} from './index'

describe('@tabitha/types/patterns', () => {
	describe('JSONC patterns & helpers', () => {
		test('strip_jsonc_comments handles single-line comments', () => {
			const jsonc = '{\n  // Single line comment\n  "key": "value"\n}'
			const result = JSON.parse(strip_jsonc_comments(jsonc))
			expect(result).toEqual({ key: 'value' })
		})

		test('strip_jsonc_comments handles multi-line block comments', () => {
			const jsonc = '{\n  /* Multi-line\n   * Block\n   */\n  "key": "value"\n}'
			const result = JSON.parse(strip_jsonc_comments(jsonc))
			expect(result).toEqual({ key: 'value' })
		})

		test('strip_jsonc_comments handles inline comments and trailing commas', () => {
			const jsonc = '{\n  "key": "value", // inline note\n  "numbers": [1, 2, ],\n}'
			const result = JSON.parse(strip_jsonc_comments(jsonc))
			expect(result).toEqual({ key: 'value', numbers: [1, 2] })
		})

		test('strip_jsonc_comments leaves URLs inside strings intact', () => {
			const jsonc = '{\n  "proxy": "https://ontology.tabitha.bible/auth", // production\'s callback\n  "next": 1\n}'
			const result = JSON.parse(strip_jsonc_comments(jsonc))
			expect(result).toEqual({ proxy: 'https://ontology.tabitha.bible/auth', next: 1 })
		})

		test('strip_jsonc_comments leaves comment markers and escaped quotes inside strings intact', () => {
			const jsonc = '{\n  "glob": "src/**/*.ts", /* block */\n  "quote": "say \\"//hi\\"",\n  "commas": ",}"\n}'
			const result = JSON.parse(strip_jsonc_comments(jsonc))
			expect(result).toEqual({ glob: 'src/**/*.ts', quote: 'say "//hi"', commas: ',}' })
		})
	})

	describe('Date patterns & helpers', () => {
		test('is_iso_date validates correct YYYY-MM-DD dates', () => {
			expect(is_iso_date('2026-08-16')).toBe(true)
			expect(is_iso_date('1999-12-31')).toBe(true)
			expect(is_iso_date('2000-01-01')).toBe(true)
		})

		test('is_iso_date rejects invalid date formats', () => {
			expect(is_iso_date('2026-8-16')).toBe(false)
			expect(is_iso_date('08/16/2026')).toBe(false)
			expect(is_iso_date('2026-08-16T12:00:00Z')).toBe(false)
			expect(is_iso_date('invalid')).toBe(false)
		})
	})

	describe('Ontology patterns & helpers', () => {
		test('CONCEPT_SENSE_REGEX matches valid concept-sense strings', () => {
			expect(CONCEPT_SENSE_REGEX.test('love-A')).toBe(true)
			expect(CONCEPT_SENSE_REGEX.test('grace-B')).toBe(true)
			expect(CONCEPT_SENSE_REGEX.test('holy_spirit-A')).toBe(true)
			expect(CONCEPT_SENSE_REGEX.test('love')).toBe(false)
			expect(CONCEPT_SENSE_REGEX.test('love-1')).toBe(false)
			expect(CONCEPT_SENSE_REGEX.test('love-a')).toBe(false)
		})

		test('parse_concept_sense extracts stem and sense', () => {
			expect(parse_concept_sense('love-A')).toEqual({ stem: 'love', sense: 'A' })
			expect(parse_concept_sense('holy_spirit-Z')).toEqual({ stem: 'holy_spirit', sense: 'Z' })
			expect(parse_concept_sense('invalid')).toBeNull()
		})

		test('normalize_wildcards converts * and # wildcards to %', () => {
			expect(normalize_wildcards('lov*')).toBe('lov%')
			expect(normalize_wildcards('gr#ce')).toBe('gr%ce')
			expect(normalize_wildcards('*peace#')).toBe('%peace%')
			expect(normalize_wildcards('plain')).toBe('plain')
		})

		test('CONCEPT_KEY_REGEX matches composite concept keys', () => {
			expect(CONCEPT_KEY_REGEX.test('love-A-Verb')).toBe(true)
			expect(CONCEPT_KEY_REGEX.test('grace-B-Noun')).toBe(true)
			expect(CONCEPT_KEY_REGEX.test('holy_spirit-A-Noun')).toBe(true)
			expect(CONCEPT_KEY_REGEX.test('love-A')).toBe(false)
			expect(CONCEPT_KEY_REGEX.test('love')).toBe(false)
		})

		test('parse_concept_key extracts stem, sense, and part of speech', () => {
			expect(parse_concept_key('love-A-Verb')).toEqual({ stem: 'love', sense: 'A', part_of_speech: 'Verb' })
			expect(parse_concept_key('holy_spirit-Z-Noun')).toEqual({ stem: 'holy_spirit', sense: 'Z', part_of_speech: 'Noun' })
			expect(parse_concept_key('love-A')).toBeNull()
			expect(parse_concept_key('invalid')).toBeNull()
		})

		test('strip_gloss_classifiers removes dictionary tags', () => {
			expect(strip_gloss_classifiers('(universal primitive) to know')).toBe('to know')
			expect(strip_gloss_classifiers('(complex) father-in-law')).toBe('father-in-law')
			expect(strip_gloss_classifiers('(LDV) ancient')).toBe('ancient')
			expect(strip_gloss_classifiers('(inexplicable) unknown token')).toBe('unknown token')
			expect(strip_gloss_classifiers('regular gloss')).toBe('regular gloss')
		})
	})

	describe('Scripture patterns & helpers', () => {
		test('USFM_VERSE_MARKER_REGEX matches verse tokens', () => {
			const text = '\\c 1 \\v 1 In the beginning \\v 2 was the Word'
			const matches = text.match(USFM_VERSE_MARKER_REGEX)
			expect(matches).toEqual(['\\v 1', '\\v 2'])
		})

		test('BIBLE_BOOKS maps book numbers to canonical book names', () => {
			expect(BIBLE_BOOKS[1]).toBe('Genesis')
			expect(BIBLE_BOOKS[9]).toBe('1 Samuel')
			expect(BIBLE_BOOKS[40]).toBe('Matthew')
			expect(BIBLE_BOOKS[66]).toBe('Revelation')
			expect(Object.keys(BIBLE_BOOKS)).toHaveLength(66)
		})

		test('by_book_order sorts references in canonical Bible order, not alphabetically', () => {
			const refs = [
				{ reference: { id_primary: 'John' } },
				{ reference: { id_primary: 'Genesis' } },
				{ reference: { id_primary: 'Amos' } },
			]
			expect(refs.toSorted(by_book_order).map(r => r.reference.id_primary))
				.toEqual(['Genesis', 'Amos', 'John'])
		})

		test('testament classifies canonical books as Old or New Testament', () => {
			expect(testament('Genesis')).toBe('Old Testament')
			expect(testament('Malachi')).toBe('Old Testament')
			expect(testament('Matthew')).toBe('New Testament')
			expect(testament('Revelation')).toBe('New Testament')
		})

		test('testament returns undefined for non-canonical book names', () => {
			expect(testament('Infected Eye')).toBeUndefined()
			expect(testament('')).toBeUndefined()
		})

		test('USFM_BOOK_CODES maps canonical book names to USFM codes', () => {
			expect(USFM_BOOK_CODES['Genesis']).toBe('GEN')
			expect(USFM_BOOK_CODES['Matthew']).toBe('MAT')
			expect(USFM_BOOK_CODES['Revelation']).toBe('REV')
			expect(Object.keys(USFM_BOOK_CODES)).toHaveLength(66)
		})

		// Guards against the two book-name lists drifting apart. A key that isn't a canonical
		// BIBLE_BOOKS name looks harmless but silently resolves to `undefined` at every call
		// site -- which is exactly what the 'Song of Songs' spelling used to do.
		test('every USFM_BOOK_CODES key is a canonical BIBLE_BOOKS name', () => {
			const canonical_names = Object.values(BIBLE_BOOKS)
			expect(Object.keys(USFM_BOOK_CODES).toSorted()).toEqual(canonical_names.toSorted())
		})

		test('USFM_BOOK_CODES uses the Song of Solomon spelling our services resolve', () => {
			expect(USFM_BOOK_CODES['Song of Solomon']).toBe('SNG')
			expect(USFM_BOOK_CODES['Song of Songs']).toBeUndefined()
		})

		test('BOOK_NAME_BY_USFM_CODE round-trips every entry in USFM_BOOK_CODES', () => {
			for (const [book_name, code] of Object.entries(USFM_BOOK_CODES)) {
				expect(BOOK_NAME_BY_USFM_CODE[code]).toBe(book_name)
			}
			expect(Object.keys(BOOK_NAME_BY_USFM_CODE)).toHaveLength(66)
		})
	})

	describe('URL patterns & helpers', () => {
		test('clean_trailing_slash strips single and multiple trailing slashes', () => {
			expect(clean_trailing_slash('http://localhost:5173/')).toBe('http://localhost:5173')
			expect(clean_trailing_slash('http://localhost:5173///')).toBe('http://localhost:5173')
			expect(clean_trailing_slash('http://localhost:5173')).toBe('http://localhost:5173')
			expect(clean_trailing_slash('/api/v1/')).toBe('/api/v1')
		})
	})
})
