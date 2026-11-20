import type { D1DatabaseSession } from '@cloudflare/workers-types'
import type { FeatureName, FeatureValue, PartOfSpeech } from '@tabitha/types'
import type { DbRowFeature, DbRowLexicon } from '#lib/types.js'

export type LexicalFeatureMap = Map<PartOfSpeech, Map<number, DbRowFeature[]>>

type DecodeLexiconFeaturesOptions = {
	readonly lexicon_row: DbRowLexicon
	readonly lexical_feature_map: LexicalFeatureMap
}

export const decode_lexicon_features = ({
	lexicon_row,
	lexical_feature_map,
}: DecodeLexiconFeaturesOptions): Record<FeatureName, FeatureValue> => {
	const rows_by_position = lexical_feature_map.get(lexicon_row.part_of_speech)

	const decoded_features: Record<FeatureName, FeatureValue> = {}
	for (const [index, code] of [...lexicon_row.features].entries()) {
		const rows_at_position = rows_by_position?.get(index + 1)
		if (!rows_at_position) continue

		const [{ feature }] = rows_at_position
		const matching_row = rows_at_position.find(row => row.code === code)
		decoded_features[feature] = matching_row?.value ?? code
	}

	return decoded_features
}

type LoadLexicalFeatureMapOptions = {
	readonly db: D1DatabaseSession
	readonly project: string
}

export const load_lexical_feature_map = async ({
	db,
	project,
}: LoadLexicalFeatureMapOptions): Promise<LexicalFeatureMap> => {
	const sql = `
		SELECT *
		FROM Lexical_Features
		WHERE project = ?
	`
	const { results } = await db.prepare(sql).bind(project).all<DbRowFeature>()

	const rows_by_category = Map.groupBy(results ?? [], ({ category }) => category)
	return new Map(
		[...rows_by_category].map(([category, rows]) => [
			category as PartOfSpeech,
			Map.groupBy(rows, ({ position }) => position),
		]),
	)
}
