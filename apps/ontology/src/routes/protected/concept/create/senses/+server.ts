import { error } from '@sveltejs/kit'
import { get_stem_senses } from '#lib/server/changes/concepts.js'
import type { RequestHandler } from './$types'
import type { PartOfSpeech } from '@tabitha/types'

export async function GET({ url: { searchParams }, locals: { db_ontology } }: Parameters<RequestHandler>[0]) {
	const stem = searchParams.get('stem') || ''
	const part_of_speech = searchParams.get('part_of_speech')

	if (!part_of_speech) {
		return error(400, 'must provide a valid "part_of_speech" parameter')
	}

	const senses = await get_stem_senses({ db: db_ontology, stem, part_of_speech: part_of_speech as PartOfSpeech })

	return Response.json({ senses })
}
