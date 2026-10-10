import type { RequestHandler } from '@sveltejs/kit'
import type { DbRowFeature } from '#lib/types.js'
import type { SourceEntityCategory, TargetFeature } from '@tabitha/types'

export async function GET({ locals: { db }, params: { project }, url: { searchParams } }: Parameters<RequestHandler>[0]) {
	const category = (searchParams.get('category')?.toLowerCase() ?? '') as SourceEntityCategory

	const lexical_sql = `
		SELECT *
		FROM Lexical_Features
		WHERE project = ?
	`
	const source_sql = `
		SELECT *
		FROM Source_Features
		WHERE project = ?
	`

	const { results: lexical_features } = await db.prepare(lexical_sql).bind(project).all<DbRowFeature>()
	const { results: source_features } = await db.prepare(source_sql).bind(project).all<DbRowFeature>()

	return Response.json({
		source: transform({ features: source_features ?? [], category }),
		lexical: transform({ features: lexical_features ?? [], category }),
	})
}

function transform({ features, category }: {
	features: DbRowFeature[]
	category: SourceEntityCategory
}): TargetFeature[] {
	return features
		.filter(f => !category.length || f.category.toLowerCase() === category)
		.map(({ category, feature, position, code, value }) => ({
			category,
			feature,
			position,
			code,
			value,
		}))
}
