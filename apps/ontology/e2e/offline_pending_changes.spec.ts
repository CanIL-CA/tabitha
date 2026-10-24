// @ts-check
import { expect, test } from '@tabitha/vite-config/playwright'

test('reopening the update page shows a queued, unsynced edit overlaid on the form', async ({ page }) => {
	const gloss = `unsynced reopen test ${Date.now()}`

	await page.goto('/protected/concept/update?concept=love-A-Verb')

	// Simulate offline by failing just the submit request -- see offline_queue.spec.ts for why
	// context.setOffline() isn't used here.
	await page.route('**/protected/concept/update/submit', route => route.abort('internetdisconnected'))

	await page.locator('textarea[name="gloss"]').fill(gloss)
	await page.getByRole('button', { name: 'Save' }).click()
	await expect(page.getByText(/saved on this device and will sync/i)).toBeVisible()

	// Saving navigates to /protected/changes. Still offline: reopen the same edit page and confirm
	// the queued edit is what's shown, not the stale server value, along with a notice that it
	// hasn't synced yet.
	await page.goto('/protected/concept/update?concept=love-A-Verb')
	await expect(page.getByText(/showing your unsynced edit/i)).toBeVisible()
	await expect(page.locator('textarea[name="gloss"]')).toHaveValue(gloss)
})

test('a concept with a queued, unsynced edit shows an unsynced badge on the search listing', async ({ page }) => {
	const gloss = `unsynced listing test ${Date.now()}`

	await page.goto('/protected/concept/update?concept=love-A-Verb')
	await page.route('**/protected/concept/update/submit', route => route.abort('internetdisconnected'))

	await page.locator('textarea[name="gloss"]').fill(gloss)
	await page.getByRole('button', { name: 'Save' }).click()
	await expect(page.getByText(/saved on this device and will sync/i)).toBeVisible()

	await page.goto('/?q=love')
	await expect(page.getByText(gloss)).toBeVisible()
	await expect(page.locator('[data-tip*="Unsynced"]')).toBeVisible()
})
