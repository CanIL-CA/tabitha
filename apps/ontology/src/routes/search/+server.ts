import { cached_json } from '@tabitha/api-client'
import { get_concepts } from '#lib/server/ontology.js'
import type { RequestHandler } from './$types'
import type { Concept } from '#lib/types.js'
import type { HowToEntry, OntologyResult, ConceptSearchFilter, SimplificationHint, PartOfSpeech } from '@tabitha/types'

export async function GET({ url: { searchParams }, locals: { db_ontology } }: Parameters<RequestHandler>[0]) {
	const search_filter: ConceptSearchFilter = {
		q: '',
		scope: 'stems',
		category: '',
		...Object.fromEntries(searchParams),
	}

	const matches = await get_concepts(db_ontology)(search_filter)

	const lite_matches = matches.map(make_lite)

	return cached_json({ data: lite_matches })

	function make_lite(concept: Concept): OntologyResult {
		const { id, stem, sense, part_of_speech, level, gloss, categorization, categories, status, how_to_hints } = concept

		return {
			id,
			stem,
			sense,
			part_of_speech: part_of_speech as PartOfSpeech,	// this is safe because we don't draw on the function words for this search API
			level,
			gloss,
			categorization,
			categories,
			status,
			how_to_hints: how_to_hints.map(make_lite_hints),
		}
	}

	function make_lite_hints(hint: SimplificationHint): HowToEntry {
		const { structure, pairing, explication } = hint
		return { structure, pairing, explication }
	}
}
