import type { Handle } from '@sveltejs/kit'

// A header, not a <meta> tag, so it also covers the JSON APIs. Don't pair it with a robots.txt
// Disallow: a blocked URL is never fetched, so crawlers never see the header.
export const noindex_handle: Handle = async function noindex_handle({ event, resolve }) {
	const response = await resolve(event)
	response.headers.set('X-Robots-Tag', 'noindex, nofollow')
	return response
}
