import { load_ontology_senses } from '#lib/data/ontology_senses.js'
import { get_source_data } from '#lib/data/read.js'
import { load_source_feature_map } from '#lib/encoding/features.js'
import { structure_semantic_encoding, transform_semantic_encoding } from '#lib/encoding/semantic_encoding.js'
import type { PageServerLoad } from './$types'

export async function load({ locals: { db }, parent, url }: Parameters<PageServerLoad>[0]) {
	const { nav_data } = await parent()

	// the source is already confirmed to exist by the layout loader
	const source = (await get_source_data({ db, ...nav_data.current }))!

	const transformed_semantic_encoding = await transform_semantic_encoding({ db, semantic_encoding: source.semantic_encoding })
	const parsed_semantic_encoding = structure_semantic_encoding(transformed_semantic_encoding)

	const features = await load_source_feature_map(db)
	const ontology_senses = await load_ontology_senses(parsed_semantic_encoding)

	return {
		source: {
			...source,
			parsed_semantic_encoding,
		},
		features,
		ontology_senses,
		// temporary: phase 1 UI is hidden with ?phase1=false
		show_phase1: url.searchParams.get('phase1') !== 'false',
	}
}
