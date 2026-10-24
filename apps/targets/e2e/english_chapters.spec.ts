import { expect, test } from '@tabitha/vite-config/playwright'

test('get all chapters of 1 Samuel (English project)', async ({ request }) => {
	const response = await request.get('/English/1 Samuel')
	const chapters = await response.json()

	expect(chapters).toHaveLength(31)
	expect(chapters).toContain('21')
})

test('Ensure book parameter is valid', async ({ request }) => {
	expect((await request.get('/4')).ok()).toBe(false)
})
