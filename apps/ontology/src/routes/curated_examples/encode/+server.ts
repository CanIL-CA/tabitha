import { error } from '@sveltejs/kit'
import { encode_curated_example } from '#lib/transformers.js'
import type { RequestHandler } from './$types'
import type { EncodeCuratedExampleRequest } from '@tabitha/types'

export async function POST({ request }: Parameters<RequestHandler>[0]) {
	const body: Partial<EncodeCuratedExampleRequest> = await request.json().catch(() => ({}))
	const { reference, sentence, entities } = body
	if (!reference || typeof sentence !== 'string' || !Array.isArray(entities)) {
		return error(400, 'Expected a "reference", a "sentence" and a list of "entities"')
	}

	const outcome = encode_curated_example({ reference, sentence, entities })
	if ('error' in outcome) return error(400, outcome.error)

	return Response.json(outcome)
}
