import { analyze } from '#lib/analyzer/index.js'
import { parse } from '#lib/parser/index.js'

import type { RequestEvent } from './$types'

export async function GET({ url: { searchParams } }: RequestEvent) {
	const text = searchParams.get('text') ?? ''

	const sentences = await parse(text)
	const source_data = analyze(sentences)

	return Response.json(source_data)
}