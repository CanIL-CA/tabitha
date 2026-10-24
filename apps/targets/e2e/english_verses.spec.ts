import { expect, test } from '@tabitha/vite-config/playwright'

test('get all verses in 1 Samuel:21 (English project)', async ({ request }) => {
	const response = await request.get('/English/1 Samuel/21')
	const verses = await response.json()

	expect(verses).toHaveLength(15)
	expect(verses).toContain('12')
})

test('Ensure chapter parameter is valid', async ({ request }) => {
	expect((await request.get('/English/1 Samuel/abc')).ok()).toBe(false)
})
