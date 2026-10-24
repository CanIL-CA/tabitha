import { expect, test } from '@tabitha/vite-config/playwright'

test('get feature lookups for English project', async ({ request }) => {
	const response = await request.get('/English/lookup/features')
	expect(response.status()).toBe(200)

	const features = await response.json()
	expect(features).toHaveProperty('source')
	expect(features).toHaveProperty('lexical')

	expect(Array.isArray(features.source)).toBe(true)
	expect(Array.isArray(features.lexical)).toBe(true)

	if (features.source.length > 0) {
		expect(features.source[0]).toHaveProperty('feature')
		expect(features.source[0]).toHaveProperty('value')
	}

	if (features.lexical.length > 0) {
		expect(features.lexical[0]).toHaveProperty('feature')
		expect(features.lexical[0]).toHaveProperty('value')
	}
})
