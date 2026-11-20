import { describe, expect, it } from 'vitest'
import { params } from './params'

async function matches_book(param: string): Promise<boolean> {
	const result = await params.book['~standard'].validate(param)
	return !result.issues
}

describe('book param', () => {
	it.each(['Genesis', '1 John', 'Song of Solomon','Revelation'])('routes the book %s', async book => {
		expect(await matches_book(book)).toBe(true)
	})

	it('routes book names in any case, as sources accepts them', async () => {
		expect(await matches_book('genesis')).toBe(true)
		expect(await matches_book('1 JOHN')).toBe(true)
	})

	it.each(['.env.test', 'config.json', 'robots.txt', 'wp-login.php', '', 'Genesis1'])('turns away %j', async probe => {
		expect(await matches_book(probe)).toBe(false)
	})
})
