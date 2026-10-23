import { expect, test } from '@playwright/test'
import { wait_for_hydration } from '@tabitha/vite-config/playwright'

test.describe('Editor Page E2E', () => {
	test('renders editor textarea and action buttons', async ({ page }) => {
		await page.goto('/')

		// Main textarea should be visible
		const textarea = page.locator('textarea')
		await expect(textarea).toBeVisible()

		// Clear button should be visible
		const clear_btn = page.getByRole('button', { name: /clear/i })
		await expect(clear_btn).toBeVisible()

		// Check button should be visible
		const check_btn = page.getByRole('button', { name: /check/i })
		await expect(check_btn).toBeVisible()
	})

	test('typing into editor and clicking clear empties the textarea', async ({ page }) => {
		await page.goto('/')
		await wait_for_hydration({ page })

		const textarea = page.locator('textarea')
		await textarea.fill('Paul write-01 letter.')
		await expect(textarea).toHaveValue('Paul write-01 letter.')

		const clear_btn = page.getByRole('button', { name: /clear/i })
		await clear_btn.click()
		await expect(textarea).toHaveValue('')
	})
})
