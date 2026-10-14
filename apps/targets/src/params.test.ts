import { describe, expect, it } from 'vitest'
import { is_book_name, is_integer, is_target_project } from './params'

describe('Route param matchers', () => {
	describe('integer matcher', () => {
		it('accepts valid non-negative integers', () => {
			expect(is_integer('1')).toBe(true)
			expect(is_integer('123')).toBe(true)
		})

		it('rejects non-digit strings', () => {
			expect(is_integer('abc')).toBe(false)
			expect(is_integer('12.3')).toBe(false)
			expect(is_integer('-5')).toBe(false)
		})
	})

	describe('valid_book matcher', () => {
		it('accepts valid book names', () => {
			expect(is_book_name('Genesis')).toBe(true)
			expect(is_book_name('1 Samuel')).toBe(true)
			expect(is_book_name('3 John')).toBe(true)
		})

		it('rejects invalid book strings', () => {
			expect(is_book_name('4 Kings')).toBe(false)
			expect(is_book_name('Book_123!')).toBe(false)
		})
	})

	describe('valid_project matcher', () => {
		it('accepts registered target-language projects', () => {
			expect(is_target_project('English')).toBe(true)
			expect(is_target_project('Swahili')).toBe(true)
			expect(is_target_project('Indonesian')).toBe(true)
			expect(is_target_project('Tagalog')).toBe(true)
		})

		it('rejects unregistered or malformed project names', () => {
			expect(is_target_project('Spanish')).toBe(false)
			expect(is_target_project('123')).toBe(false)
			expect(is_target_project('English_1')).toBe(false)
		})
	})
})
