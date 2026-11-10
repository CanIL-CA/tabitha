import { load_ontology_senses } from '#lib/data/ontology_senses.js'
import { get_source_data } from '#lib/data/read.js'
import { build_noun_list_rows } from '#lib/data/noun_list.js'
import { structure_semantic_encoding, transform_semantic_encoding } from '#lib/encoding/semantic_encoding.js'
import type { PageServerLoad } from './$types'
import type { PageData } from '#lib/types.js'

export async function load({ locals: { db }, parent }: Parameters<PageServerLoad>[0]) {
	const { nav_data } = await parent()

	// the source is already confirmed to exist by the layout loader
	const source = (await get_source_data({ db, ...nav_data.current }))!

	const transformed_semantic_encoding = await transform_semantic_encoding({ db, semantic_encoding: source.semantic_encoding })
	const parsed_semantic_encoding = structure_semantic_encoding(transformed_semantic_encoding)
	const noun_list = build_noun_list_rows({ source_entities: parsed_semantic_encoding })
	const ontology_senses = await load_ontology_senses(parsed_semantic_encoding)

	const data: PageData = {
		source: {
			...source,
			parsed_semantic_encoding,
			noun_list,
		},
		ontology_senses,
	}
	return data
}
