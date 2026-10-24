// https://playwright.dev/docs/writing-tests#first-test
// @ts-check
import { expect, test } from '@tabitha/vite-config/playwright'

// https://playwright.dev/docs/test-fixtures#built-in-fixtures
test('get all chapters of Psalms', async ({ request }) => {
	const response = await request.get('/Bible/Psalms')

	const chapters = await response.json()

	// https://playwright.dev/docs/api/class-genericassertions#generic-assertions-to-equal
	expect(chapters).toHaveLength(150)

	// https://playwright.dev/docs/api/class-genericassertions#generic-assertions-to-contain-equal
	expect(chapters).toContainEqual({
		id_secondary: '121',
	})
})
