import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AiResponseError, type EmbeddingClient } from '@tabitha/ai'
import {
	hash_document,
	is_searchable,
	read_concept_key,
	sync_concept_embeddings,
	to_concept_document,
	type ConceptIndex,
} from './concept_embeddings'
import type { VectorizeVector } from '@cloudflare/workers-types'
import type { Concept } from '#lib/types.js'
import type { SimplificationHint } from '@tabitha/types'

function make_concept(overrides: Partial<Concept> = {}): Concept {
	return {
		id: '1',
		stem: 'rejoice',
		sense: 'A',
		part_of_speech: 'Verb',
		level: '1',
		categorization: '',
		examples: '',
		gloss: '(LDV) to feel great happiness',
		brief_gloss: '',
		occurrences: 0,
		categories: [],
		curated_examples: [],
		curated_examples_raw: '',
		status: 'in ontology',
		how_to_hints: [],
		pending_changes: [],
		...overrides,
	}
}

function make_hint(overrides: Partial<SimplificationHint> = {}): SimplificationHint {
	return {
		stem: 'fellowship',
		sense: '',
		part_of_speech: 'Noun',
		structure: 'X has fellowship with Y',
		pairing: 'friendship',
		explication: 'X and Y spend time together',
		ontology_status: 'suggested',
		level: 1,
		...overrides,
	}
}

function make_examples(sentences: string[]): Concept['curated_examples'] {
	return sentences.map(sentence => ({
		reference: { type: 'Bible', id_primary: 'Genesis', id_secondary: '1', id_tertiary: '1' },
		encoding: [],
		sentence,
	}))
}

function create_fake_index(): ConceptIndex & { vectors: Map<string, VectorizeVector> } {
	const vectors = new Map<string, VectorizeVector>()
	return {
		vectors,
		query: vi.fn(),
		upsert: vi.fn(async (new_vectors: VectorizeVector[]) => {
			for (const vector of new_vectors) vectors.set(vector.id, vector)
		}),
		getByIds: vi.fn(async (ids: string[]) => ids.flatMap(id => vectors.get(id) ?? [])),
		deleteByIds: vi.fn(async (ids: string[]) => {
			// Mirrors Vectorize's own limit: VECTOR_DELETE_ERROR (code 40007), "max id count is 100".
			if (ids.length > 100) throw new Error(`too many ids in payload; max id count is 100, got ${ids.length}`)
			for (const id of ids) vectors.delete(id)
		}),
	}
}

function create_fake_embedder(): EmbeddingClient & { embed_text: ReturnType<typeof vi.fn> } {
	return { embed_text: vi.fn(async () => [0.1, 0.2, 0.3]) }
}

describe('is_searchable', () => {
	it.each([
		['a whole number', { stem: '52', gloss: '(inexplicable) the number' }],
		['a proper name', { stem: 'Moses', gloss: '(proper name) a man' }],
		['a date', { stem: '30AD', gloss: 'a year' }],
		['a concept marked for deletion', { gloss: 'DELETE this one' }],
		['a blank how-to row', { stem: '', sense: '' }],
		['a punctuation mark', { stem: ':', sense: '' }],
	])('excludes %s', (_, overrides) => {
		expect(is_searchable(make_concept(overrides))).toBe(false)
	})

	it.each([
		['a decimal, so "tenth" can relate to it', { stem: '.1', gloss: 'a tenth of a number' }],
		['12PM, so "noon" can relate to it', { stem: '12PM', gloss: 'noon' }],
		['an ordinary concept', {}],
	])('keeps %s', (_, overrides) => {
		expect(is_searchable(make_concept(overrides))).toBe(true)
	})
})

describe('to_concept_document', () => {
	it('titles the document with the stem and drops parenthesized classifiers from the gloss', () => {
		expect(to_concept_document(make_concept())).toEqual({
			key: 'rejoice-A-Verb',
			concept: { stem: 'rejoice', sense: 'A', part_of_speech: 'Verb' },
			title: 'rejoice',
			text: 'to feel great happiness',
		})
	})

	it('describes a concept not yet in the ontology by its first how-to hint', () => {
		const concept = make_concept({ stem: 'fellowship', sense: '', part_of_speech: 'Noun', status: 'suggested', how_to_hints: [make_hint()] })

		expect(to_concept_document(concept).text).toBe('X has fellowship with Y - friendship - X and Y spend time together')
	})

	it('leaves out empty how-to hint fields rather than their separators', () => {
		const concept = make_concept({ stem: 'graze', status: 'approved', how_to_hints: [make_hint({ structure: '', pairing: ' ', explication: '"eat grass"' })] })

		expect(to_concept_document(concept).text).toBe('"eat grass"')
	})

	it('leaves the text empty for a hint with every field empty', () => {
		const concept = make_concept({ stem: 'topic', status: 'not used', how_to_hints: [make_hint({ structure: '', pairing: '', explication: '' })] })

		expect(to_concept_document(concept).text).toBe('')
	})

	it('leaves the text empty for a concept with neither a gloss nor a hint', () => {
		expect(to_concept_document(make_concept({ status: 'suggested', how_to_hints: [] })).text).toBe('')
	})

	it('fills in an empty gloss with the first two curated example sentences', () => {
		const concept = make_concept({ stem: 'swim', gloss: '(LDV)', curated_examples: make_examples(['John swims.', 'The prisoners swam away from the ship.', 'The prisoners swam to the shore.']) })

		expect(to_concept_document(concept).text).toBe('John swims. The prisoners swam away from the ship.')
	})

	it('adds curated example sentences to a gloss shorter than three words', () => {
		const concept = make_concept({ stem: 'black', gloss: '(LDV) the color', curated_examples: make_examples(['The man\'s clothes were black.']) })

		expect(to_concept_document(concept).text).toBe('the color: The man\'s clothes were black.')
	})

	it('keeps a gloss of three or more words as is, even with curated examples', () => {
		const concept = make_concept({ curated_examples: make_examples(['The people rejoiced.']) })

		expect(to_concept_document(concept).text).toBe('to feel great happiness')
	})
})

describe('hash_document', () => {
	it('is stable for the same document and changes when the text does', async () => {
		const document = to_concept_document(make_concept())
		const edited = to_concept_document(make_concept({ gloss: 'to feel very glad' }))

		expect(await hash_document(document)).toBe(await hash_document(document))
		expect(await hash_document(edited)).not.toBe(await hash_document(document))
	})
})

describe('sync_concept_embeddings', () => {
	beforeEach(() => {
		vi.spyOn(console, 'warn').mockImplementation(() => {})
	})

	it('embeds every searchable concept on the first run, storing its key fields and text hash', async () => {
		const index = create_fake_index()
		const embedder = create_fake_embedder()
		const concepts = [make_concept(), make_concept({ stem: 'Moses', gloss: '(proper name) a man' })]

		const summary = await sync_concept_embeddings({ concepts, index, embedder })

		expect(summary).toEqual({ embedded: 1, unchanged: 0, failed: 0 })
		expect(embedder.embed_text).toHaveBeenCalledWith({ purpose: 'document', title: 'rejoice', text: 'to feel great happiness' })
		expect(index.vectors.get('rejoice-A-Verb')?.metadata).toEqual({
			text_hash: await hash_document(to_concept_document(make_concept())),
			stem: 'rejoice',
			sense: 'A',
			part_of_speech: 'Verb',
		})
	})

	it('embeds nothing when no concept text has changed since the last run', async () => {
		const index = create_fake_index()
		await sync_concept_embeddings({ concepts: [make_concept()], index, embedder: create_fake_embedder() })
		const embedder = create_fake_embedder()

		const summary = await sync_concept_embeddings({ concepts: [make_concept()], index, embedder })

		expect(summary).toEqual({ embedded: 0, unchanged: 1, failed: 0 })
		expect(embedder.embed_text).not.toHaveBeenCalled()
	})

	it('re-embeds only the concept whose gloss changed', async () => {
		const index = create_fake_index()
		const other = make_concept({ stem: 'plate', part_of_speech: 'Noun', gloss: 'something used to put food on' })
		await sync_concept_embeddings({ concepts: [make_concept(), other], index, embedder: create_fake_embedder() })
		const embedder = create_fake_embedder()

		await sync_concept_embeddings({ concepts: [make_concept({ gloss: 'to feel very glad' }), other], index, embedder })

		expect(embedder.embed_text).toHaveBeenCalledTimes(1)
		expect(embedder.embed_text).toHaveBeenCalledWith(expect.objectContaining({ title: 'rejoice', text: 'to feel very glad' }))
	})

	it('removes the vector of a concept that has since been marked for deletion', async () => {
		const index = create_fake_index()
		await sync_concept_embeddings({ concepts: [make_concept()], index, embedder: create_fake_embedder() })

		await sync_concept_embeddings({ concepts: [make_concept({ gloss: 'DELETE' })], index, embedder: create_fake_embedder() })

		expect(index.vectors.has('rejoice-A-Verb')).toBe(false)
	})

	it('clears more unsearchable concepts than Vectorize accepts in one delete call', async () => {
		const index = create_fake_index()
		const proper_names = Array.from({ length: 150 }, (_, i) => make_concept({ stem: `Name${i}`, gloss: '(proper name) a person' }))

		await sync_concept_embeddings({ concepts: proper_names, index, embedder: create_fake_embedder() })

		expect(index.deleteByIds).toHaveBeenCalledTimes(2)
	})

	it('leaves a concept whose embedding failed unindexed, so the next run retries it', async () => {
		const index = create_fake_index()
		const embedder = create_fake_embedder()
		embedder.embed_text.mockRejectedValueOnce(new AiResponseError('rate limited'))

		const summary = await sync_concept_embeddings({ concepts: [make_concept()], index, embedder })

		expect(summary).toEqual({ embedded: 0, unchanged: 0, failed: 1 })
		expect(index.vectors.size).toBe(0)
	})

	it('rethrows an unexpected embedding error instead of counting it as a failure', async () => {
		const embedder = create_fake_embedder()
		embedder.embed_text.mockRejectedValueOnce(new TypeError('bug'))

		await expect(sync_concept_embeddings({ concepts: [make_concept()], index: create_fake_index(), embedder })).rejects.toThrow('bug')
	})

	it('skips a concept whose key is longer than a Vectorize ID allows', async () => {
		const index = create_fake_index()
		const embedder = create_fake_embedder()

		await sync_concept_embeddings({ concepts: [make_concept({ stem: 'x'.repeat(80) })], index, embedder })

		expect(embedder.embed_text).not.toHaveBeenCalled()
		expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('64-byte'))
	})
})

describe('read_concept_key', () => {
	it('reads the key fields stored on a vector', () => {
		expect(read_concept_key({ text_hash: 'abc', stem: 'sound-like', sense: 'C', part_of_speech: 'Verb' }))
			.toEqual({ stem: 'sound-like', sense: 'C', part_of_speech: 'Verb' })
	})

	it('returns null for a vector missing them', () => {
		expect(read_concept_key({ text_hash: 'abc' })).toBeNull()
		expect(read_concept_key(undefined)).toBeNull()
	})
})
