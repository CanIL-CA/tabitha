// @ts-check
import { expect, test, wait_for_hydration } from '@tabitha/vite-config/playwright'

test('a queued create shows up as unsynced on the changes page', async ({ page }) => {
	const stem = `offlinecreate${Date.now()}`

	await page.goto('/protected/concept/create')
	// a field filled before hydration finishes never reaches the debounced sense lookup below
	await wait_for_hydration({ page })

	await page.locator('input[name="stem"]').fill(stem)
	await page.locator('select[name="part_of_speech"]').selectOption('Verb')

	// wait for the debounced sense lookup to resolve before routing kicks in below -- it hits a
	// different endpoint than the submit route we're about to fail, so it should succeed normally
	await expect(page.locator('input[name="sense"]')).not.toHaveValue('')

	await page.route('**/protected/concept/create/submit', route => route.abort('internetdisconnected'))

	await page.getByRole('button', { name: 'Save' }).click()
	await expect(page.getByText(/saved on this device and will sync/i)).toBeVisible()

	await page.goto('/protected/changes')
	// the stem also appears in the concept filter's options, so look in the change's own row
	const change_row = page.getByRole('row').filter({ hasText: stem })
	await expect(change_row).toBeVisible()
	await expect(change_row.getByText('Unsynced')).toBeVisible()
})
