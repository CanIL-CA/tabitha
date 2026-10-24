import { expect, test, wait_for_hydration } from '@tabitha/vite-config/playwright'

test('the batch form looks up verse and chapter counts as the book and chapter change', async ({ page }) => {
	// a fresh browser context has no saved reference, so the form starts at Genesis 1
	await page.goto('/batch')
	await wait_for_hydration({ page })

	await expect(page.getByText('(31 verses in chapter)')).toBeVisible()

	await page.getByRole('spinbutton').first().fill('2')
	await expect(page.getByText('(25 verses in chapter)')).toBeVisible()

	await page.getByRole('combobox').first().selectOption('Ruth')
	await expect(page.getByText('(23 verses in chapter)')).toBeVisible()

	await page.getByRole('radio', { name: 'Multiple chapters' }).check()
	await expect(page.getByText('(4 chapters in book)')).toBeVisible()
})
