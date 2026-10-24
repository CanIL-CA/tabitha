// https://playwright.dev/docs/writing-tests#first-test
// @ts-check
import { expect, test } from '@tabitha/vite-config/playwright'

// https://playwright.dev/docs/test-fixtures#built-in-fixtures
test('check API contract, e.g., /search?q=love', async ({ request }) => {
	const response = await request.get('/search?q=love')
	const matches = await response.json()

	// https://playwright.dev/docs/api/class-genericassertions#generic-assertions-to-contain-equal
	expect(matches).toContainEqual({
		id: expect.any(Number),
		stem: 'love',
		sense: expect.any(String),
		part_of_speech: expect.any(String),
		level: expect.any(String),
		gloss: expect.any(String),
		categorization: expect.any(String),
		categories: expect.any(Array),
		status: expect.any(String),
		how_to_hints: [],
	})
})

test('ensure API is case-insensitive, e.g., /search?q=Love', async ({ request }) => {
	const lowercase_matches = await (await request.get('/search?q=love')).json()
	const uppercase_matches = await (await request.get('/search?q=Love')).json()

	expect(lowercase_matches).toEqual(uppercase_matches)
})

test("ensure missing parameter is handled properly, e.g., /search, /search?, /search?q, /search?q=, /search?q=''", async ({ request }) => {
	const bad_requests = [
		'/search',
		'/search?',
		'/search?q',
		'/search?q=',
		"/search?q=''",
	]

	for (const bad_request of bad_requests) {
		const response = await request.get(bad_request)
		const matches = await response.json()

		expect(matches).toEqual([])
	}
})

test('ensure call with no matches is handled properly, e.g., /search?q=supercalifragilisticexpialidocious', async ({ request }) => {
	const response = await request.get('/search?q=supercalifragilisticexpialidocious')
	const matches = await response.json()

	expect(matches).toEqual([])
})
