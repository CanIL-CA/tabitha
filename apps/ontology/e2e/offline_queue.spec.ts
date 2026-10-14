// @ts-check
import { test, expect } from '@playwright/test'

test('an edit made while offline is queued locally, then syncs once back online', async ({ page }) => {
	const gloss = `offline test ${Date.now()}`

	await page.goto('/protected/concept/update?concept=love-A-Verb')

	// Simulate offline by failing just the submit request, so the rest of the page keeps working
	// (see e2e/README.md for why not context.setOffline()).
	await page.route('**/protected/concept/update/submit', route => route.abort('internetdisconnected'))

	await page.locator('textarea[name="gloss"]').fill(gloss)
	await page.getByRole('button', { name: 'Save' }).click()

	await expect(page.getByText(/saved on this device and will sync/i)).toBeVisible()

	await page.unroute('**/protected/concept/update/submit')
	await page.evaluate(() => window.dispatchEvent(new Event('online')))

	// Saving navigates to /protected/changes, so reopen the edit page. A fresh page load reads
	// straight from the server (and also re-triggers the app's own bootstrap flush check), so this
	// only shows the new gloss if the queued mutation actually made it there -- not just optimistic
	// local state.
	await expect(async () => {
		await page.goto('/protected/concept/update?concept=love-A-Verb')
		await expect(page.locator('textarea[name="gloss"]')).toHaveValue(gloss)
	}).toPass({ timeout: 10_000 })
})
