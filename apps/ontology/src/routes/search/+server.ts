import { error } from '@sveltejs/kit'
import { cached_json } from '@tabitha/api-client'
import { get_concepts, get_concepts_by_stems } from '#lib/server/ontology.js'
import type { RequestHandler } from './$types'
import type { Concept } from '#lib/types.js'
import type { HowToEntry, OntologyResult, ConceptSearchFilter, SimplificationHint, PartOfSpeech } from '@tabitha/types'

const MAX_TERMS_PER_BATCH = 1000

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
}

/**
 * Searches stems for many terms in one request, so a long passage doesn't cost one request per word.
 * Terms match stems exactly (case-insensitive); unlike GET, there are no wildcards or sense-specific terms.
 * Responds with each requested term mapped to its concepts.
 */
export async function POST({ request, locals: { db_ontology } }: Parameters<RequestHandler>[0]) {
	const { terms } = await request.json()
	if (!Array.isArray(terms) || !terms.every(term => typeof term === 'string')) {
		error(400, '"terms" must be an array of strings')
	}
	if (terms.length > MAX_TERMS_PER_BATCH) {
		error(400, `"terms" can hold at most ${MAX_TERMS_PER_BATCH} terms`)
	}

	const matches = (await get_concepts_by_stems({ db: db_ontology, stems: terms })).map(make_lite)

	const results_by_term: Record<string, OntologyResult[]> = Object.fromEntries(terms.map(term => [
		term,
		matches.filter(match => match.stem.toLowerCase() === term.toLowerCase()),
	]))

	return Response.json(results_by_term)
}

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
