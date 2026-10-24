// https://playwright.dev/docs/writing-tests#first-test
// @ts-check
import { expect, test } from '@tabitha/vite-config/playwright'

// https://playwright.dev/docs/test-fixtures#built-in-fixtures
test('get all verses of Psalm 119', async ({ request }) => {
	const response = await request.get('/Bible/Psalms/119')

	const verses = await response.json()

	// https://playwright.dev/docs/api/class-genericassertions#generic-assertions-to-equal
	expect(verses).toHaveLength(176)

	// https://playwright.dev/docs/api/class-genericassertions#generic-assertions-to-contain-equal
	expect(verses).toContainEqual({
		id_tertiary: '21',
	})
})
