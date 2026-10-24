import { expect, test } from '@tabitha/vite-config/playwright'

test.describe('Search UI Flow', () => {
	test('renders search input and page structure', async ({ page }) => {
		const returnToParam = encodeURIComponent(JSON.stringify({ app: 'ontology', q: 'david' }))
		await page.goto(`/English/search?q=david&return_to=${returnToParam}`)

		// Check search input value
		const searchInput = page.locator('input[type="search"]')
		await expect(searchInput).toHaveValue('david')

		// Check Return to Ontology link presence in DOM
		const returnLink = page.getByRole('link', { name: /Return to Ontology/i })
		await expect(returnLink).toBeAttached()
	})
})
