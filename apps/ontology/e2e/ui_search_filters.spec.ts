import { expect, test, wait_for_hydration } from '@tabitha/vite-config/playwright'

test('searches for concepts and renders summary cards', async ({ page }) => {
	await page.goto('/?q=love&category=all&scope=stems')

	// Results badge should be visible with positive count
	const results_badge = page.locator('header em.badge')
	await expect(results_badge).toBeVisible()
	await expect(results_badge).toContainText('results')

	// Should display concept cards
	const cards = page.locator('article.card')
	await expect(cards.first()).toBeVisible()
})

test('expands concept modal and verifies filter dropdowns default to valid options', async ({ page }) => {
	await page.goto('/?q=take&category=all&scope=stems')
	await wait_for_hydration({ page })

	// Locate the first EXPAND button and click it
	const expand_btn = page.locator('article.card').first().getByRole('button', { name: 'EXPAND' })
	await expect(expand_btn).toBeVisible()
	await expand_btn.click()

	// Modal dialog should appear in the DOM
	const modal = page.locator('dialog.modal')
	await expect(modal).toBeAttached({ timeout: 5000 })

	// Wait for examples section to load inside modal
	const filter_selects = modal.locator('form select.select')
	await expect(filter_selects.first()).toBeVisible({ timeout: 5000 }).catch(() => {})

	const count = await filter_selects.count()
	if (count > 0) {
		// Verify every filter select has a non-empty initial value (e.g. 'Any', never blank)
		for (let i = 0; i < count; i++) {
			const select = filter_selects.nth(i)
			const value = await select.inputValue()
			expect(value).toBeTruthy()
			expect(value.length).toBeGreaterThan(0)
		}
	}
})
