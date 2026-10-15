import { describe, expect, it } from 'vitest'
import { compare_stems } from './concepts'

describe('compare_stems', () => {
	it("orders characters by TBTA's custom sequence, not standard alphabetical order", () => {
		// In the custom sequence '-0123456789abc...', '-' sorts before digits, which sort before letters.
		expect(compare_stems({ a: '-abc', b: 'abc' })).toBeLessThan(0)
		expect(compare_stems({ a: '9', b: 'a' })).toBeLessThan(0)
		expect(compare_stems({ a: 'a', b: '9' })).toBeGreaterThan(0)
	})

	it('returns 0 for identical stems', () => {
		expect(compare_stems({ a: 'love', b: 'love' })).toBe(0)
	})

	it('ignores characters not present in the sorting sequence, e.g. spaces and punctuation', () => {
		// Note: '-' is itself part of the sequence (its first/lowest-ranked character), so it is
		// deliberately excluded from this example -- only truly absent characters are ignored.
		expect(compare_stems({ a: 'a b!c', b: 'abc' })).toBe(0)
	})

	it('is case-sensitive on its own; callers are expected to lowercase both inputs first', () => {
		// The sorting sequence only contains lowercase letters, so an uppercase letter is treated as
		// "not in the sequence" and skipped, the same as a space or punctuation mark would be.
		expect(compare_stems({ a: 'ABC', b: 'abc' })).not.toBe(0)
	})

	it('treats a shorter stem (in valid characters) as sorting first when it is a prefix of the longer one', () => {
		expect(compare_stems({ a: 'cat', b: 'catalog' })).toBeLessThan(0)
		expect(compare_stems({ a: 'catalog', b: 'cat' })).toBeGreaterThan(0)
	})

	it('is usable as an Array.prototype.sort comparator when wrapped to match its positional callback shape', () => {
		const stems = ['zebra', 'apple', '9lives', '-hyphen']
		stems.sort((a, b) => compare_stems({ a, b }))

		expect(stems).toEqual(['-hyphen', '9lives', 'apple', 'zebra'])
	})
})
