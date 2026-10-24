import { expect, test } from '@tabitha/vite-config/playwright'

test('get all targets', async ({ request }) => {
	const response = await request.get('/')
	const sources = await response.json()

	expect(sources).toContain('English')
})
