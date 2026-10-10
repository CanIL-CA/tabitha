import { is_used_in_source, load_source_feature_map } from '#lib/encoding/features.js'
import type { SourceEntityCategory } from '@tabitha/types'
import type { PageServerLoad } from './$types'
import type { FeatureMap } from '#lib/types.js'

export async function load({ locals: { db } }: Parameters<PageServerLoad>[0]) {
	const features = await load_source_feature_map(db)

	const features_to_show: FeatureMap = new Map([...features.entries()].map(([category, features]) => {
		const filtered_features = features.filter(is_used_in_source(category as SourceEntityCategory))
		return [category, filtered_features]
	}))

	return {
		features: features_to_show,
	}
}
