import { get_source_data } from '#lib/data/read.js'
import { transform_semantic_encoding } from '#lib/encoding/semantic_encoding.js'
import { simplify_encoding } from '#lib/encoding/simplify.js'
import { strip_gloss_classifiers } from '@tabitha/types/patterns'
import { create_ontology_client } from '@tabitha/api-client'
import { error } from '@sveltejs/kit'
import { PUBLIC_ONTOLOGY_API_HOST } from '$env/static/public'
import type { Reference, SourceSimpleJsonResult, SourceEntity } from '@tabitha/types'
import type { RequestHandler } from './$types'

const ontology_client = create_ontology_client({ base_url: PUBLIC_ONTOLOGY_API_HOST, cache: true })

export async function GET({ locals: { db }, params: { type, id_primary, id_secondary, id_tertiary }, url: { searchParams } }: Parameters<RequestHandler>[0]) {
	const include_glosses = searchParams.get('glosses') === 'true'

	const reference: Reference = { type, id_primary, id_secondary, id_tertiary }
	const source = await get_source_data({ db, ...reference })

	if (!source) {
		error(404, 'Unknown source reference.')
	}
	
	const encoding = await transform_semantic_encoding({ db, semantic_encoding: source.semantic_encoding })
	const simple_encoding = simplify_encoding(encoding)

	if (include_glosses) {
		const glosses = await fetch_glosses(encoding)
		return Response.json({ encoding: simple_encoding, glosses } as SourceSimpleJsonResult)
	}

	return Response.json({ encoding: simple_encoding } as SourceSimpleJsonResult)
}

// Using SourceEntity[] here is simpler because it's flat, whereas SimpleEncodingEntity[] is a structured json tree
async function fetch_glosses(entities: SourceEntity[]): Promise<Record<string, string>> {
	const concept_keys = [...new Set(entities.filter(entity => !!entity.concept).map(({ concept, category }) => `${concept?.stem}-${concept?.sense}&&${category}`))]

	const all_glosses: [string, string][] = await Promise.all(concept_keys.filter(key => !key.startsWith('-')).map(async key => {
		const [concept, category] = key.split('&&')
		const gloss = await fetch_concept_gloss({ concept, category })
		return [`${concept}-${category}`, gloss]
	}))
	return Object.fromEntries(all_glosses.filter(entry => entry[1].length))
}

async function fetch_concept_gloss({ concept, category }: { concept: string, category: string }): Promise<string> {
	const result = await ontology_client.search_concepts({ q: concept, category })
	const gloss = result.length ? result[0].gloss : ''
	return strip_gloss_classifiers(gloss)
}
