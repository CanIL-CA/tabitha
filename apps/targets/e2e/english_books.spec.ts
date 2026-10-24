import { expect, test } from '@tabitha/vite-config/playwright'

test('get all generated books in the Bible (English project)', async ({ request }) => {
	const response = await request.get('/English')
	const books = await response.json()

	expect(books.length).toBeGreaterThan(34)
	expect(books.length).toBeLessThan(67)
	expect(books).toContain('1 Samuel')
})

test('Ensure language parameter is valid', async ({ request }) => {
	expect((await request.get('/English')).ok()).toBe(true)
	expect((await request.get('/123')).ok()).toBe(false)
})
