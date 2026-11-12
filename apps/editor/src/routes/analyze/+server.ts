import { get_analyze_result } from '#lib/analyzer/index.js'
import type { RequestEvent } from './$types'

export async function GET({ url: { searchParams } }: RequestEvent) {
	const text = searchParams.get('text') ?? ''

	const result = await get_analyze_result(text)

	return Response.json(result)
}