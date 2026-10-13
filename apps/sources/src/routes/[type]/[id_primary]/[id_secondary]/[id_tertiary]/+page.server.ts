import { get_next_reference, get_previous_reference } from '#lib/data/navigation.js'
import { get_source_data } from '#lib/data/read.js'
import { get_noun_list, structure_semantic_encoding, transform_semantic_encoding } from '#lib/encoding/semantic_encoding.js'
import { error } from '@sveltejs/kit'
import type { PageServerLoad } from './$types'
import type { Reference } from '@tabitha/types'
import type { PageData } from '#lib/types.js'

export async function load({ locals: { db }, params: { type, id_primary, id_secondary, id_tertiary } }: Parameters<PageServerLoad>[0]) {
	const reference: Reference = { type, id_primary, id_secondary, id_tertiary }
	const source = await get_source_data({ db, ...reference })

	if (!source) {
		error(404, 'Unknown source reference.')
	}
	reference.id_primary = source.id_primary	// get the proper capitalization

	const transformed_semantic_encoding = await transform_semantic_encoding({ db, semantic_encoding: source.semantic_encoding })
	const parsed_semantic_encoding = structure_semantic_encoding(transformed_semantic_encoding)
	const noun_list = get_noun_list(source.semantic_encoding)
	const previous = await get_previous_reference({ db, reference })
	const next = await get_next_reference({ db, reference })

	const data: PageData = {
		source: {
			...source,
			parsed_semantic_encoding,
			noun_list,
		},
		nav_data: {
			previous,
			current: reference,
			next,
		},
	}
	return data
}
