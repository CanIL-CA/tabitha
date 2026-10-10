import { get_source_data } from '#lib/data/read.js'
import { transform_semantic_encoding } from '#lib/encoding/semantic_encoding.js'
import { error } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import type { Reference, SourceResult } from '@tabitha/types'

export async function GET({ locals: { db }, params: { type, id_primary, id_secondary, id_tertiary } }: Parameters<RequestHandler>[0]) {
	const reference: Reference = { type, id_primary, id_secondary, id_tertiary }
	const source = await get_source_data({ db, ...reference })

	if (!source) {
		error(404, 'Unknown source reference.')
	}
	
	const parsed_semantic_encoding = await transform_semantic_encoding({ db, semantic_encoding: source.semantic_encoding })
	const data: SourceResult = {
		...source,
		parsed_semantic_encoding,
	}
	return Response.json(data)
}
