// https://playwright.dev/docs/writing-tests#first-test
// @ts-check
import { expect, test } from '@tabitha/vite-config/playwright'

// https://playwright.dev/docs/test-fixtures#built-in-fixtures
test('check API contract, e.g., /simplification_hints?complex_term=disciple', async ({ request }) => {
	const response = await request.get('/simplification_hints?complex_term=disciple')
	const matches = await response.json()

	// https://playwright.dev/docs/api/class-genericassertions#generic-assertions-to-contain-equal
	expect(matches).toContainEqual({
		stem: 'disciple',
		sense: expect.any(String),
		part_of_speech: expect.any(String),
		structure: expect.any(String),
		pairing: expect.any(String),
		explication: expect.any(String),
		ontology_status: expect.any(String),
		level: expect.any(Number),
	})
})

test('ensure API is case-insensitive, e.g., /simplification_hints?complex_term=DISciPlE-a', async ({ request }) => {
	const lowercase_matches = await (await request.get('/simplification_hints?complex_term=disciple-A')).json()
	const uppercase_matches = await (await request.get('/simplification_hints?complex_term=DISciPlE-A')).json()

	expect(lowercase_matches).toEqual(uppercase_matches)
})

test("ensure missing parameter is handled properly, e.g., /simplification_hints, /simplification_hints?, /simplification_hints?complex_term, /simplification_hints?complex_term=, /simplification_hints?complex_term=''", async ({ request }) => {
	const bad_requests = [
		'/simplification_hints',
		'/simplification_hints?',
		'/simplification_hints?complex_term',
		'/simplification_hints?complex_term=',
		"/simplification_hints?complex_term=''",
	]

	for (const bad_request of bad_requests) {
		const response = await request.get(bad_request)
		const matches = await response.json()

		expect(matches).toEqual([])
	}
})

test('ensure call with no matches is handled properly, e.g., /simplification_hints?complex_term=supercalifragilisticexpialidocious', async ({ request }) => {
	const response = await request.get('/simplification_hints?complex_term=supercalifragilisticexpialidocious')
	const matches = await response.json()

	expect(matches).toEqual([])
})
