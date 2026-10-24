import { expect, test } from '@tabitha/vite-config/playwright'

const STUBBED_RESULT = {
	status: 'ok',
	phase_1: 'Paul(N) wrote-C.',
	notes: [],
	check: { status: 'ok', tokens: [], back_translation: '' },
}

test.describe('AI Assist Page E2E', () => {
	test('nav link is visible from the main page and navigates to /ai-assist', async ({ page }) => {
		await page.goto('/')

		const nav_link = page.getByRole('link', { name: /ai assist/i })
		await expect(nav_link).toBeVisible()

		await nav_link.click()
		await expect(page).toHaveURL('/ai-assist')
	})

	test('generate is disabled until text is entered', async ({ page }) => {
		await page.goto('/ai-assist')

		const generate_btn = page.getByRole('button', { name: /generate/i })
		await expect(generate_btn).toBeDisabled()

		await page.locator('textarea').first().fill('Paul wrote a letter.')
		await expect(generate_btn).toBeEnabled()
	})

	test('clicking generate renders the suggestion and a copy button', async ({ page }) => {
		await page.route('**/ai-assist/generate', route => route.fulfill({ json: STUBBED_RESULT }))

		await page.goto('/ai-assist')
		await page.locator('textarea').first().fill('Paul wrote a letter.')
		await page.getByRole('button', { name: /generate/i }).click()

		await expect(page.getByRole('heading', { name: /ai-generated phase 1/i })).toBeVisible()
		await expect(page.getByRole('button', { name: /copy phase 1/i })).toBeVisible()
	})

	test('send to editor navigates to / with the generated text in the main textarea', async ({ page }) => {
		await page.route('**/ai-assist/generate', route => route.fulfill({ json: STUBBED_RESULT }))

		await page.goto('/ai-assist')
		await page.locator('textarea').first().fill('Paul wrote a letter.')
		await page.getByRole('button', { name: /generate/i }).click()
		await page.getByRole('button', { name: /send to editor/i }).click()

		await expect(page).toHaveURL('/')
		await expect(page.locator('textarea').first()).toHaveValue(STUBBED_RESULT.phase_1)
	})
})
