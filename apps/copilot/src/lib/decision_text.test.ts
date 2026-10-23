import { describe, expect, test } from 'vitest'
import { split_decision_lines } from './decision_text'

describe('split_decision_lines', () => {
	test('turns a literal backslash-n into a line break', () => {
		expect(split_decision_lines(String.raw`There are two options.\n1. Translate the literal meaning.\n2. Translate the figurative meaning.`)).toEqual([
			'There are two options.',
			'1. Translate the literal meaning.',
			'2. Translate the figurative meaning.',
		])
	})

	test('keeps real line breaks as separate lines and drops blank ones', () => {
		expect(split_decision_lines('First line\n\nSecond line\n')).toEqual(['First line', 'Second line'])
	})

	test('starts numbered points run together on one line on their own lines', () => {
		expect(split_decision_lines('There are two ways: 1. They happen in order. 2) They contrast.')).toEqual([
			'There are two ways:',
			'1. They happen in order.',
			'2) They contrast.',
		])
	})

	test('leaves a number that is not part of a list alone', () => {
		expect(split_decision_lines('The fine was 2.5 shekels, paid in 2 installments.')).toEqual(['The fine was 2.5 shekels, paid in 2 installments.'])
	})

	test('returns no lines for empty text', () => {
		expect(split_decision_lines('')).toEqual([])
	})
})
