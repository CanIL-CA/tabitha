import { cached_json } from '@tabitha/api-client'
import { get_brief_headings } from '#lib/server/brief/brief.js'
import type { RequestHandler } from './$types'

export async function GET({ url: { searchParams }, locals: { ai } }: Parameters<RequestHandler>[0]) {
	const lwc = searchParams.get('lwc') || 'English'

	const result = await get_brief_headings({ lwc, ai })
	return cached_json({ data: result })
}
