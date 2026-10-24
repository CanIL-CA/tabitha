import { expect, test } from '@tabitha/vite-config/playwright'

test('get all generated text from in 1 Samuel 21:1 (English project)', async ({ request }) => {
	const response = await request.get('/English/1 Samuel/21/1')
	const texts_by_audience = await response.json()
	const serialized_texts = JSON.stringify(texts_by_audience, null, 2)

	expect(serialized_texts).toBeTruthy()
	expect(serialized_texts).toContain('David')
})

test('Ensure verse parameter is valid', async ({ request }) => {
	expect((await request.get('/English/1 Samuel/21/abc')).ok()).toBe(false)
})
