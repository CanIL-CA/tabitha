import { get_previous_reference } from '#lib/data/navigation.js'
import { get_source_data } from '#lib/data/read.js'
import { bible_book_number, generate_verse_text } from '#lib/generation/generator.js'
import { error, json } from '@sveltejs/kit'
import { env } from 'cloudflare:workers'
import type { RequestHandler } from './$types'
import type { Reference } from '@tabitha/types'

const AUDIENCES = [1, 2, 3, 4]

export async function POST({ locals: { db }, params: { type, id_primary, id_secondary, id_tertiary }, request }: Parameters<RequestHandler>[0]) {
	// Undefined under `vite dev`, which has no service bindings
	const generator = env.GENERATOR as typeof env.GENERATOR | undefined
	if (!generator) return json({ error: 'Text generation is not available in this environment.' }, { status: 503 })

	const { audience = 1 } = await request.json().catch(() => ({})) as { audience?: number }
	if (!AUDIENCES.includes(audience)) error(400, `audience must be one of ${AUDIENCES.join(', ')}`)

	const reference: Reference = { type, id_primary, id_secondary, id_tertiary }
	const source = await get_source_data({ db, ...reference })
	if (!source) error(404, 'Unknown source reference.')
	const book = type.toLowerCase() === 'bible' ? bible_book_number(source.id_primary) : undefined
	if (!book) error(400, 'Text generation only supports Bible verses.')
	if (!source.semantic_encoding) return json({ error: 'This verse has no encoding yet.' }, { status: 422 })

	const previous_reference = await get_previous_reference({ db, reference })
	const previous = previous_reference && await get_source_data({ db, ...previous_reference })

	const { status, body } = await generate_verse_text({
		generator,
		book,
		chapter: Number(source.id_secondary),
		verse: Number(source.id_tertiary),
		encoding: source.semantic_encoding,
		previous_encoding: previous?.semantic_encoding ?? '',
		audience,
	})
	return json(body, { status })
}
