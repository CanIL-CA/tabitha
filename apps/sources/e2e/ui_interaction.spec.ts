// @ts-check
import { expect, test } from '@playwright/test'
import { wait_for_hydration } from '@tabitha/vite-config/playwright'

test('search bar parses reference and redirects to verse page', async ({ page }) => {
	await page.goto('/')

	const searchInput = page.locator('#search_query')
	await searchInput.fill('Genesis 1:1')
	await page.locator('form[role="search"] button[type="submit"]').click()

	// this is the first test to load a page on a cold dev server, where Vite's dependency optimizer
	// can stall that first load for several seconds, longer than the default 5s assertion timeout
	await expect(page).toHaveURL(/\/Bible\/Genesis\/1\/1$/, { timeout: 20_000 })
})

test('search bar runs a Phase 1 text search for non-reference input, without a full page load', async ({ page }) => {
	// a submit before hydration is a native form post, which would be a full page load regardless
	await page.goto('/')
	await wait_for_hydration({ page })
	await page.evaluate(() => Object.assign(window, { still_same_document: true }))

	await page.locator('#search_query').fill('"the people of Israel"')
	await page.locator('form[role="search"] button[type="submit"]').click()

	await expect(page).toHaveURL(/\/search\?q=/)
	await expect(page.locator('li.list-row mark').first()).toHaveText(/the people of Israel/i)
	expect(await page.evaluate(() => 'still_same_document' in window)).toBe(true)
})

test('clicking next verse button navigates to next verse', async ({ page }) => {
	await page.goto('/Bible/Genesis/1/1')

	const nextButton = page.locator('a[title*="Genesis 1:2"]')
	await nextButton.click()

	await expect(page).toHaveURL(/\/Bible\/Genesis\/1\/2$/)
})

test('status lookup page renders status overview', async ({ page }) => {
	await page.goto('/lookup/status/Bible')

	const heading = page.locator('h2:has-text("Encoding Status")')
	await expect(heading).toBeVisible()

	const chapterDetailsLink = page.locator('a[href*="/lookup/status/Bible/Genesis"]').first()
	await chapterDetailsLink.click()

	await expect(page).toHaveURL(/\/lookup\/status\/Bible\/Genesis$/)
})
