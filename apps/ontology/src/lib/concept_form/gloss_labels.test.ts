import { describe, expect, it } from 'vitest'
import { apply_gloss_label, find_leading_gloss_label, relabel_gloss_for_level } from './gloss_labels'

describe('find_leading_gloss_label', () => {
	it('finds a known label at the start of the gloss', () => {
		expect(find_leading_gloss_label('(LDV) to swim')).toBe('(LDV)')
		expect(find_leading_gloss_label('  (proper name) Moses')).toBe('(proper name)')
	})

	it('tells (complex) and (complex alternate) apart', () => {
		expect(find_leading_gloss_label('(complex) father-in-law')).toBe('(complex)')
		expect(find_leading_gloss_label('(complex alternate) father-in-law')).toBe('(complex alternate)')
	})

	it('ignores a label that is not at the start', () => {
		expect(find_leading_gloss_label('to swim (LDV)')).toBeUndefined()
		expect(find_leading_gloss_label('')).toBeUndefined()
	})
})

describe('apply_gloss_label', () => {
	it('replaces a known leading label', () => {
		expect(apply_gloss_label({ gloss: '(simple) to swim', label: '(LDV)' })).toBe('(LDV) to swim')
	})

	it('inserts the label when there is none', () => {
		expect(apply_gloss_label({ gloss: 'to swim', label: '(simple)' })).toBe('(simple) to swim')
	})

	it('leaves a trailing space after the label in an empty gloss so the description can be typed straight after it', () => {
		expect(apply_gloss_label({ gloss: '', label: '(simple)' })).toBe('(simple) ')
	})

	it('leaves the rest of the gloss untouched', () => {
		expect(apply_gloss_label({ gloss: '(complex) (NP) a person (LDV)', label: '(simple)' })).toBe('(simple) (NP) a person (LDV)')
	})
})

describe('relabel_gloss_for_level', () => {
	it("uses each level's default label", () => {
		expect(relabel_gloss_for_level({ gloss: '(complex) to swim', level: '1' })).toBe('(simple) to swim')
		expect(relabel_gloss_for_level({ gloss: '(simple) Moses', level: '4' })).toBe('(proper name) Moses')
		expect(relabel_gloss_for_level({ gloss: '(LDV) to swim', level: '2' })).toBe('(complex) to swim')
	})

	it('leaves the gloss alone for a level with no labels', () => {
		expect(relabel_gloss_for_level({ gloss: '(simple) to swim', level: '9' })).toBe('(simple) to swim')
	})
})
