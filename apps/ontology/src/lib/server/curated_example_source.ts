import { find_concept_word_indexes, simplify_source_entities, CuratedExampleSourceError } from '#lib/curated_example/simplify_source_entities.js'
import { split_example_lines } from '#lib/curated_example/format.js'
import { structure_curated_example_encoding, transform_curated_examples } from '#lib/transformers.js'
import type { CuratedExampleEntityStructured } from '#lib/types.js'
import { error } from '@sveltejs/kit'
import type { ConceptKey, Reference, SourceEntity } from '@tabitha/types'

/** What the page starts from: the example, with the reference it is from and the English for it, if known */
export type CuratedExampleSource = {
	reference: Reference
	encoding: CuratedExampleEntityStructured[]
	sentence: string
	/** The index of the existing example that saving replaces, if it replaces one */
	replaces: number | null
	/** For an example made from a verse, the indexes of the words in the verse that use the concept, and the one that was used */
	word_indexes: number[]
	word_index: number | null
}

type FindSourceOptions = {
	search_params: URLSearchParams
	concept: ConceptKey
	/** All of the concept's curated examples, as the text they are kept in */
	curated_examples: string
	fetch_verse: (reference: Reference) => Promise<SourceEntity[] | null>
}


function parse_index({ search_params, name }: { search_params: URLSearchParams; name: string }): number | null {
	const NON_NEGATIVE_INTEGER = /^\d+$/

	const value = search_params.get(name)
	if (value === null) return null
	if (!NON_NEGATIVE_INTEGER.test(value)) throw error(400, `Expected '${name}' to be a number, like 2`)

	return Number(value)
}

function parse_reference(value: string): Reference {
	const [type, id_primary, id_secondary, id_tertiary, ...rest] = value.split('/')
	if (!type || !id_primary || !id_secondary || !id_tertiary || rest.length) throw error(400, "Expected 'reference' to look like Bible/Exodus/2/2")

	return { type, id_primary, id_secondary, id_tertiary }
}

/** An encoded example becomes the entities to start from. The sentence is the one it was written with. */
function read_encoded_example(encoded_example: string): Pick<CuratedExampleSource, 'reference' | 'encoding' | 'sentence'> {
	const examples = transform_curated_examples(encoded_example)
	const [example] = examples
	if (examples.length !== 1 || !example.encoding.length || !example.reference.id_primary) throw error(400, 'The example is not a curated example')

	return { reference: example.reference, encoding: structure_curated_example_encoding(example.encoding), sentence: example.sentence }
}

async function read_verse({ search_params, concept, fetch_verse }: Pick<FindSourceOptions, 'search_params' | 'concept' | 'fetch_verse'>): Promise<Omit<CuratedExampleSource, 'replaces'>> {
	const reference = parse_reference(search_params.get('reference') ?? '')
	const source_entities = await fetch_verse(reference)
	if (!source_entities) throw error(404, 'The verse could not be found')

	const word_indexes = find_concept_word_indexes({ source_entities, concept })
	if (!word_indexes.length) throw error(404, `The verse does not use ${concept.stem}-${concept.sense}`)

	const word_index = parse_index({ search_params, name: 'entity' }) ?? word_indexes[0]
	if (!word_indexes.includes(word_index)) throw error(400, "The 'entity' is not a use of the concept in the verse")

	try {
		const encoding = structure_curated_example_encoding(simplify_source_entities({ source_entities, word_index }))
		return { reference, encoding, sentence: '', word_indexes, word_index }
	} catch (cause) {
		if (cause instanceof CuratedExampleSourceError) throw error(400, cause.message)
		throw cause
	}
}

/**
 * Finds what the page starts from, which is one of:
 * - an `example` that is already encoded, such as one made by another program
 * - a `reference` to a verse, with the `entity` of the word in it when the verse uses the concept more than once
 * - the existing example that `replaces` names, to edit it
 * `replaces` also says which existing example saving replaces, for the first two.
 */
export async function find_curated_example_source({ search_params, concept, curated_examples, fetch_verse }: FindSourceOptions): Promise<CuratedExampleSource> {
	const lines = split_example_lines(curated_examples)
	const replaces = parse_index({ search_params, name: 'replaces' })
	if (replaces !== null && replaces >= lines.length) throw error(400, `The concept has no curated example number ${replaces}`)

	const no_word_choices = { word_indexes: [], word_index: null }
	const encoded_example = search_params.get('example')
	if (encoded_example !== null) return { ...read_encoded_example(encoded_example), replaces, ...no_word_choices }
	if (search_params.has('reference')) return { ...await read_verse({ search_params, concept, fetch_verse }), replaces }
	if (replaces !== null) return { ...read_encoded_example(lines[replaces]), replaces, ...no_word_choices }

	throw error(400, "Expected an 'example', a 'reference' or a 'replaces' parameter")
}
