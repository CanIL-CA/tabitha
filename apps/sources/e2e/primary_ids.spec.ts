// https://playwright.dev/docs/writing-tests#first-test
// @ts-check
import { expect, test } from '@tabitha/vite-config/playwright'

// https://playwright.dev/docs/test-fixtures#built-in-fixtures
test('get all books in the Bible', async ({ request }) => {
	const response = await request.get('/Bible')

	const books = await response.json()

	// https://playwright.dev/docs/api/class-genericassertions#generic-assertions-to-equal
	expect(books).toHaveLength(66)

	// https://playwright.dev/docs/api/class-genericassertions#generic-assertions-to-contain-equal
	expect(books).toContainEqual({
		id_primary: '1 Timothy',
	})
})
