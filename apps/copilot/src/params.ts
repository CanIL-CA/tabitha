import { defineParams } from '@sveltejs/kit/params'
// SvelteKit loads this file with Node's own loader at build time, which can't resolve the
// extensionless re-exports in `@tabitha/types/patterns`; `scripture.ts` has no imports.
import { BIBLE_BOOKS } from '@tabitha/types/patterns/scripture'

const KNOWN_BOOKS = new Set(Object.values(BIBLE_BOOKS).map(book => book.toLowerCase()))

/**
 * `book` only routes real book names, so scanner probes like `/.env` or `/config.json` 404 before
 * the handler fetches from sources or logs an error.
 */
export const params = defineParams({
	book: param => KNOWN_BOOKS.has(param.toLowerCase()) ? param : undefined,
})
