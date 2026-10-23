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

	test('Ctrl-Enter runs the check and plain Enter adds a newline', async ({ page }) => {
		await page.goto('/')
		await wait_for_hydration({ page })

		const textarea = page.locator('textarea')
		await textarea.fill('Paul write-01 letter.')
		await textarea.press('Enter')
		await expect(textarea).toHaveValue('Paul write-01 letter.\n')

		const check_request = page.waitForRequest(request => new URL(request.url()).pathname === '/check')
		await textarea.press('Control+Enter')
		await check_request
	})

	test('Tab from the text area goes to Check, Clear, Copy, then Save', async ({ page }) => {
		await page.goto('/')
		await wait_for_hydration({ page })

		await page.locator('textarea').focus()
		const focused_names: string[] = []
		for (let press = 0; press < 4; press++) {
			await page.keyboard.press('Tab')
			focused_names.push(await page.evaluate(() => document.activeElement?.textContent?.trim() ?? ''))
		}

		expect(focused_names).toEqual([expect.stringMatching(/check/i), expect.stringMatching(/clear/i), expect.stringMatching(/copy/i), expect.stringMatching(/save/i)])
	})
})
