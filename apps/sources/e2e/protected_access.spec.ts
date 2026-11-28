import { expect, test } from '@tabitha/vite-config/playwright'

const EDIT_PATH = '/protected/edit/Bible/Genesis/1/1'

test('a minted session reaches the edit page without going through Google OAuth', async ({ page }) => {
	const response = await page.goto(EDIT_PATH)

	expect(response?.status()).toBe(200)
	await expect(page).toHaveTitle(/^Edit Genesis 1:1/)
})

test("the edit page's old URL redirects to its new one", async ({ page }) => {
	await page.goto('/Bible/Genesis/1/1/edit')

	await expect(page).toHaveURL(EDIT_PATH)
	await expect(page).toHaveTitle(/^Edit Genesis 1:1/)
})

test('the edit page turns away a visitor who is not signed in', async ({ browser }) => {
	const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } })
	const page = await anonymous.newPage()

	const response = await page.goto(EDIT_PATH)

	expect(response?.status()).toBe(401)
	await anonymous.close()
})

test('the verse page stays public', async ({ browser }) => {
	const anonymous = await browser.newContext({ storageState: { cookies: [], origins: [] } })
	const page = await anonymous.newPage()

	const response = await page.goto('/Bible/Genesis/1/1')

	expect(response?.status()).toBe(200)
	await expect(page.getByRole('button', { name: 'Sign in to see additional features' })).toBeVisible()
	await anonymous.close()
})
