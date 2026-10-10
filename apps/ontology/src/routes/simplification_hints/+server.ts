import { cached_json } from '@tabitha/api-client'
import { get_simplification_hints } from '#lib/server/ontology.js'
import type { RequestHandler } from './$types'
import type { ConceptSearchFilter } from '@tabitha/types'

export async function GET({ url: { searchParams }, locals: { db_ontology } }: Parameters<RequestHandler>[0]) {
	const complex_term = searchParams.get('complex_term') ?? ''
	const category = searchParams.get('category') ?? ''

	const concept_filter: ConceptSearchFilter = {
		q: complex_term,
		scope: 'stems',
		category,
	}

	const matches = await get_simplification_hints(db_ontology)(concept_filter)

	return cached_json({ data: matches })
}
