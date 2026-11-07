import { defineParams } from '@sveltejs/kit/params'
import { BIBLE_BOOKS } from '@tabitha/types/patterns'

const KNOWN_BOOKS = new Set(Object.values(BIBLE_BOOKS).map(book => book.toLowerCase()))

/**
 * `book` only routes real book names, so scanner probes like `/.env` or `/config.json` 404 before
 * the handler fetches from sources or logs an error.
 */
export const params = defineParams({
	book: param => KNOWN_BOOKS.has(param.toLowerCase()) ? param : undefined,
})
