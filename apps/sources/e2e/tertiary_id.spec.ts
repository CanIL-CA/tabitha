// https://playwright.dev/docs/writing-tests#first-test
// @ts-check
import { expect, test } from '@tabitha/vite-config/playwright'

// https://playwright.dev/docs/test-fixtures#built-in-fixtures
test('get data for Daniel 3:9', async ({ request }) => {
	const response = await request.get('/Bible/Daniel/3/9')

	const { type, id_primary, id_secondary, id_tertiary, phase_1_encoding, semantic_encoding } = await response.json()

	// https://playwright.dev/docs/api/class-genericassertions#generic-assertions-to-equal
	expect(type).toBe('Bible')
	expect(id_primary).toBe('Daniel')
	expect(id_secondary).toBe('3')
	expect(id_tertiary).toBe('9')
	expect(phase_1_encoding).toBeTruthy()
	expect(semantic_encoding).toBeTruthy()
})
