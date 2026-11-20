import { get_previous_reference } from '#lib/data/navigation.js'
import { get_source_data } from '#lib/data/read.js'
import { generate_verse_text } from '#lib/generation/generator.js'
import { verse_generation } from '#lib/generation/verse_generation.js'
import { error, json } from '@sveltejs/kit'
import { env } from 'cloudflare:workers'
import type { RequestHandler } from './$types'
import { AUDIENCE_NUMBERS } from '@tabitha/generator/engine'
import type { Reference } from '@tabitha/types'

export async function POST({ locals: { db }, params: { type, id_primary, id_secondary, id_tertiary }, request }: Parameters<RequestHandler>[0]) {
	// Undefined under `vite dev`, which has no service bindings
	const generator = env.GENERATOR as typeof env.GENERATOR | undefined
	if (!generator) return json({ error: 'Text generation is not available in this environment.' }, { status: 503 })

	const { audience = 1 } = await request.json().catch(() => ({})) as { audience?: number }
	if (!AUDIENCE_NUMBERS.includes(audience)) error(400, `audience must be one of ${AUDIENCE_NUMBERS.join(', ')}`)

	const reference: Reference = { type, id_primary, id_secondary, id_tertiary }
	const source = await get_source_data({ db, ...reference })
	if (!source) error(404, 'Unknown source reference.')

	const previous_reference = await get_previous_reference({ db, reference })
	const previous_source = previous_reference && await get_source_data({ db, ...previous_reference })
	const generation = verse_generation({ source, previous_source })
	if ('error' in generation) return json({ error: generation.error }, { status: 422 })

	const { status, body } = await generate_verse_text({ generator, ...generation.job, audience })
	return json(body, { status })
}
