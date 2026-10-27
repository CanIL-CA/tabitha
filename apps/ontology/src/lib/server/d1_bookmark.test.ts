import { describe, expect, it } from 'vitest'
import { bookmark_cookie, read_bookmark } from './d1_bookmark'

const BOOKMARK = '000016ae-00000000-00005111-2236ac08fef43a4622d9879915dcc164'

describe('d1_bookmark', () => {
	it('reads back a bookmark saved by the same build', () => {
		const cookie = bookmark_cookie({ bookmark: BOOKMARK, build: '1793141135424' })

		expect(read_bookmark({ cookie, build: '1793141135424' })).toBe(BOOKMARK)
	})

	it('ignores a bookmark saved by another build, which may point at another database', () => {
		const cookie = bookmark_cookie({ bookmark: BOOKMARK, build: '1793049498516' })

		expect(read_bookmark({ cookie, build: '1793141135424' })).toBeUndefined()
	})

	it('starts fresh without a cookie', () => {
		expect(read_bookmark({ cookie: undefined, build: '1793141135424' })).toBeUndefined()
	})

	it('ignores a bare bookmark with no build', () => {
		expect(read_bookmark({ cookie: BOOKMARK, build: '1793141135424' })).toBeUndefined()
	})
})
