import { expect, test } from '@tabitha/vite-config/playwright'

const JOHN_3_16 = { type: 'Bible', id_primary: 'John', id_secondary: '3', id_tertiary: '16' }

test('/English/search?q=<a phrase too long for a LIKE pattern>', async ({ request }) => {
	// Longer than D1's 50-byte limit on a LIKE pattern once wrapped as `%phrase%`
	const phrase = 'God loved the people of the earth very much so he gave his only son'

	const response = await request.get(`/English/search?q="${phrase}"`)

	expect(response.status()).toBe(200)
	expect(await response.json()).toEqual(expect.arrayContaining([expect.objectContaining({ reference: JOHN_3_16 })]))
})

test('/English/search?q=<a wildcard phrase>', async ({ request }) => {
	const response = await request.get('/English/search?q="God loved the * of the earth"')

	expect(response.status()).toBe(200)
	expect(await response.json()).toEqual(expect.arrayContaining([expect.objectContaining({ reference: JOHN_3_16 })]))
})
