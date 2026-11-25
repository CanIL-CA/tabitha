import { redirect } from '@sveltejs/kit'
import type { RequestHandler } from './$types'

// The edit page moved under /protected (ADR 0027); old links and bookmarks land on the new URL.
export function GET({ params: { type, id_primary, id_secondary, id_tertiary }, url }: Parameters<RequestHandler>[0]): never {
	const reference_path = [type, id_primary, id_secondary, id_tertiary].map(encodeURIComponent).join('/')
	redirect(308, `/protected/edit/${reference_path}${url.search}`)
}
