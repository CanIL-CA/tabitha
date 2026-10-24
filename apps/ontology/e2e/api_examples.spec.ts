import { expect, test } from '@tabitha/vite-config/playwright'

test('check API contract, e.g., /examples?concept=love-A&part_of_speech=Verb', async ({ request }) => {
	const response = await request.get('/examples?concept=love-A&part_of_speech=Verb')
	expect(response.status()).toBe(200)

	const matches = await response.json()
	expect(Array.isArray(matches)).toBe(true)

	if (matches.length > 0) {
		expect(matches).toContainEqual({
			reference: {
				type: expect.any(String),
				id_primary: expect.any(String),
				id_secondary: expect.any(String),
				id_tertiary: expect.any(String),
			},
			context: expect.any(Object),
			book_status: expect.any(String),
		})
	}
})

test('ensure missing required parameters return 400 Bad Request', async ({ request }) => {
	const bad_requests = [
		'/examples',
		'/examples?concept=love-A',
		'/examples?part_of_speech=Verb',
	]

	for (const bad_request of bad_requests) {
		const response = await request.get(bad_request)
		expect(response.status()).toBe(400)
	}
})

test('ensure call with non-existent concept returns empty array', async ({ request }) => {
	const response = await request.get('/examples?concept=nonexistentconcept-Z&part_of_speech=Verb')
	expect(response.status()).toBe(200)

	const matches = await response.json()
	expect(matches).toEqual([])
})
