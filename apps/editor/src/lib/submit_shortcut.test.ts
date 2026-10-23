import { describe, expect, test } from 'vitest'
import { is_submit_shortcut } from './submit_shortcut'

const NO_MODIFIERS = { key: 'Enter', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, isComposing: false }

describe('is_submit_shortcut', () => {
	test('Ctrl-Enter and Cmd-Enter submit', () => {
		expect(is_submit_shortcut({ ...NO_MODIFIERS, ctrlKey: true })).toBe(true)
		expect(is_submit_shortcut({ ...NO_MODIFIERS, metaKey: true })).toBe(true)
	})

	test('plain Enter stays a newline', () => {
		expect(is_submit_shortcut(NO_MODIFIERS)).toBe(false)
	})

	test('other modifier combinations do not submit', () => {
		expect(is_submit_shortcut({ ...NO_MODIFIERS, shiftKey: true })).toBe(false)
		expect(is_submit_shortcut({ ...NO_MODIFIERS, ctrlKey: true, altKey: true })).toBe(false)
		expect(is_submit_shortcut({ ...NO_MODIFIERS, metaKey: true, shiftKey: true })).toBe(false)
	})

	test('other keys do not submit', () => {
		expect(is_submit_shortcut({ ...NO_MODIFIERS, key: 'a', ctrlKey: true })).toBe(false)
	})

	test('confirming an IME composition does not submit', () => {
		expect(is_submit_shortcut({ ...NO_MODIFIERS, ctrlKey: true, isComposing: true })).toBe(false)
	})
})
