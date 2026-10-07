export const prerender = true

const SITE = 'https://tabitha.bible'

// Every page under src/routes, so a new route joins the sitemap without a second edit.
const page_files = import.meta.glob('/src/routes/**/+page.svelte')

function to_path(file: string) {
	const path = file.replace('/src/routes', '').replace(/\/?\+page\.svelte$/, '')
	return path === '' ? '/' : path
}

export function GET() {
	const urls = Object.keys(page_files)
		.map(to_path)
		.sort()
		.map(path => `\t<url><loc>${new URL(path, SITE).href}</loc></url>`)
		.join('\n')

	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
	return new Response(body, { headers: { 'content-type': 'application/xml' } })
}
