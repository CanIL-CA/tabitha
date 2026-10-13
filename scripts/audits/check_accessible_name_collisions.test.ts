import { describe, expect, it } from 'bun:test'
import { extract_labels_from_content, layout_chain_for_page } from './check_accessible_name_collisions'

describe('Accessible-Name Collision Checker', () => {
	describe('extract_labels_from_content', () => {
		it('extracts literal text from <a> and <button> elements', () => {
			const markup = `
				<a href="/">Home</a>
				<button onclick={submit}>Check</button>
			`
			const labels = extract_labels_from_content(markup)
			expect(labels.has('Home')).toBe(true)
			expect(labels.has('Check')).toBe(true)
		})

		it('extracts text from div/span elements with role="button"', () => {
			const markup = `
				<div role="button" onclick={dismiss}>Dismiss</div>
				<span role="button" tabindex="0">Toggle</span>
			`
			const labels = extract_labels_from_content(markup)
			expect(labels.has('Dismiss')).toBe(true)
			expect(labels.has('Toggle')).toBe(true)
		})

		it('strips nested markup and collapses whitespace when extracting a label', () => {
			const markup = '<button>\n\t<span>Save</span>\n\tchanges\n</button>'
			const labels = extract_labels_from_content(markup)
			expect(labels.has('Save changes')).toBe(true)
		})

		it('ignores icon-only interactive elements with no visible text', () => {
			const markup = '<button><svg><path d="M1 1" /></svg></button>'
			const labels = extract_labels_from_content(markup)
			expect(labels.size).toBe(0)
		})

		it('extracts labels from a { name, href } data-array literal, driven by AppNav.svelte\'s actual shape', () => {
			const script = `
				const links = [
					{ name: 'Home', href: '/' },
					{ name: 'AI Assist', href: '/ai-assist' },
				]
			`
			const labels = extract_labels_from_content(script)
			expect(labels.has('Home')).toBe(true)
			expect(labels.has('AI Assist')).toBe(true)
		})

		it('extracts data-array labels regardless of key order (href before label)', () => {
			const script = "const link = { href: '/settings', label: 'Settings' }"
			const labels = extract_labels_from_content(script)
			expect(labels.has('Settings')).toBe(true)
		})

		it('does not treat an unrelated "name" field as a nav label when there is no href in the same object', () => {
			const script = "const user = { name: 'Alex', email: 'alex@example.com' }"
			const labels = extract_labels_from_content(script)
			expect(labels.has('Alex')).toBe(false)
		})
	})

	describe('layout_chain_for_page', () => {
		it('includes the root layout for a top-level page', () => {
			const chain = layout_chain_for_page({
				page_path: '/app/src/routes/+page.svelte',
				all_layouts: ['/app/src/routes/+layout.svelte'],
			})
			expect(chain).toEqual(['/app/src/routes/+layout.svelte'])
		})

		it('includes every layout from the routes root down to the page\'s own directory', () => {
			const chain = layout_chain_for_page({
				page_path: '/app/src/routes/settings/profile/+page.svelte',
				all_layouts: [
					'/app/src/routes/+layout.svelte',
					'/app/src/routes/settings/+layout.svelte',
				],
			})
			expect(chain).toEqual([
				'/app/src/routes/+layout.svelte',
				'/app/src/routes/settings/+layout.svelte',
			])
		})

		it('excludes a layout that lives under a sibling route branch', () => {
			const chain = layout_chain_for_page({
				page_path: '/app/src/routes/settings/+page.svelte',
				all_layouts: ['/app/src/routes/search/+layout.svelte'],
			})
			expect(chain).toEqual([])
		})
	})
})
