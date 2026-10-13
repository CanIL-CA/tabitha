import type { ConceptKey, PartOfSpeech } from '../core'

/**
 * Matches linguistic concept-sense identifiers formatted as `<stem>-<SENSE_LETTER>`.
 *
 * @example
 * Positive: "love-A", "grace-B", "holy_spirit-A"
 * Negative: "love", "love-1", "love-a"
 */
export const CONCEPT_SENSE_REGEX = /^(.*)-([A-Z])$/

const SENSE_LETTER_REGEX = /^[A-Z]$/
const LINE_TERMINATOR_REGEX = /[\n\r\u2028\u2029]/

export const IS_CARDINAL_NUMBER = /^[.\d]+$/

/**
 * Matches UI search wildcard characters (`*` and `#`).
 *
 * @example
 * Positive: "lov*", "gr#ce", "*peace*"
 * Negative: "love", "grace"
 */
export const SQL_WILDCARD_CHAR_REGEX = /[*#]/g

/**
 * Matches linguistic gloss classifier prefixes used in source data dictionaries.
 *
 * @example
 * Positive: "(universal primitive) ", "(LDV) ", "(complex) ", "(complex alternate) ", "(inexplicable) "
 * Negative: "(noun)", "(verb)"
 */
export const GLOSS_CLASSIFIER_REGEX = /\((universal primitive|LDV|complex|complex alternate|inexplicable)\) /g

/**
 * Normalizes user search wildcards (`*` and `#`) into SQL `LIKE` wildcard `%`.
 *
 * @param wildcard_str Search query string containing possible `*` or `#`
 * @returns Normalized SQL search pattern
 *
 * @example
 * normalize_wildcards("lov*") -> "lov%"
 * normalize_wildcards("gr#ce") -> "gr%ce"
 */
export function normalize_wildcards(wildcard_str: string): string {
	return wildcard_str.replace(SQL_WILDCARD_CHAR_REGEX, '%')
}

/**
 * Parses a concept-sense key into its constituent stem and uppercase sense letter.
 *
 * @param key Potential concept sense identifier (e.g. "love-A")
 * @returns Parsed object with stem and sense, or null if key does not match
 *
 * @example
 * parse_concept_sense("love-A") -> { stem: "love", sense: "A" }
 * parse_concept_sense("invalid") -> null
 */
export function parse_concept_sense(key: string): { stem: string; sense: string } | null {
	const match = key.trim().match(CONCEPT_SENSE_REGEX)
	if (!match) return null
	return {
		stem: match[1],
		sense: match[2],
	}
}

/**
 * Parses a composite concept key formatted as `<stem>-<SENSE_LETTER>-<part_of_speech>` into its
 * constituent stem, sense, and part of speech. The stem ends at the first `-<SENSE_LETTER>-` after
 * at least one character, so hyphenated stems like "father-in-law" survive. Scans by hand rather
 * than with `/^(.+?)-([A-Z])-(.+)$/`, which backtracks quadratically on keys from URL params.
 *
 * @param key Potential composite concept identifier (e.g. "love-A-Verb")
 * @returns Parsed ConceptKey object, or null if key does not match
 *
 * @example
 * parse_concept_key("love-A-Verb") -> { stem: "love", sense: "A", part_of_speech: "Verb" }
 * parse_concept_key("invalid") -> null
 */
export function parse_concept_key(key: string): ConceptKey | null {
	const trimmed = key.trim()
	if (LINE_TERMINATOR_REGEX.test(trimmed)) return null

	for (let i = 1; i + 3 < trimmed.length; i++) {
		if (trimmed[i] === '-' && trimmed[i + 2] === '-' && SENSE_LETTER_REGEX.test(trimmed[i + 1])) {
			return {
				stem: trimmed.slice(0, i),
				sense: trimmed[i + 1],
				part_of_speech: trimmed.slice(i + 3) as PartOfSpeech,
			}
		}
	}
	return null
}

type ConceptCompare = Omit<ConceptKey, 'part_of_speech'> & {
	part_of_speech: string
}

export function concepts_match({ a, b }: { a: ConceptCompare, b: ConceptCompare }) {
	return a.stem === b.stem && a.sense === b.sense && a.part_of_speech === b.part_of_speech
}

/**
 * Strips dictionary classifier prefixes from a gloss definition.
 *
 * @param gloss Raw gloss text with potential classifier prefix
 * @returns Clean gloss text
 *
 * @example
 * strip_gloss_classifiers("(universal primitive) to know") -> "to know"
 * strip_gloss_classifiers("(complex) father-in-law") -> "father-in-law"
 */
export function strip_gloss_classifiers(gloss: string): string {
	return gloss.replace(GLOSS_CLASSIFIER_REGEX, '')
}
