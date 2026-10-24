// @ts-check
import { expect, test } from '@tabitha/vite-config/playwright'

test('a minted session reaches protected pages without going through Google OAuth', async ({ page }) => {
	const response = await page.goto('/protected/changes')

	expect(response?.status()).toBe(200)
	await expect(page.getByRole('heading', { name: 'Changes' })).toBeVisible()
})
