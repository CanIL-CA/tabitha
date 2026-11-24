import { describe, expect, it, vi } from 'vitest'
import { find_curated_example_source } from './curated_example_source.js'
import type { ConceptKey, Reference, SourceEntity } from '@tabitha/types'

const GIVE: ConceptKey = { stem: 'give', sense: 'A', part_of_speech: 'Verb' }

const entity = (overrides: Partial<SourceEntity>): SourceEntity => ({
	category: '', category_abbr: '', value: '', concept: null, pairing_concept: null, pairing_type: null,
	feature_codes: '', features: [], noun_list_index: null, ...overrides,
})
const open_clause = () => entity({ category: 'Clause', value: '{', features: [{ name: 'Type', value: 'Independent' }] })
const close_clause = () => entity({ value: '}' })
const open_phrase = ({ category, role }: { category: SourceEntity['category']; role?: string }) =>
	entity({ category, value: '(', features: role ? [{ name: 'Semantic Role', value: role }] : [] })
const close_phrase = () => entity({ value: ')' })
const word = ({ category, stem }: { category: 'Noun' | 'Verb'; stem: string }) =>
	entity({ category, value: stem, concept: { stem, sense: 'A', part_of_speech: category } })

const verb_phrase = (stem: string) => [open_phrase({ category: 'Verb Phrase' }), word({ category: 'Verb', stem }), close_phrase()]
const noun_phrase = ({ stem, role }: { stem: string; role: string }) => [open_phrase({ category: 'Noun Phrase', role }), word({ category: 'Noun', stem }), close_phrase()]

//                    0    1-3 (John)                                  4-6 (give)    7-9 (book)                                  10-12 (give)   13
const VERSE = [open_clause(), ...noun_phrase({ stem: 'John', role: 'Most Agent-like' }), ...verb_phrase('give'), ...noun_phrase({ stem: 'book', role: 'Most Patient-like' }), ...verb_phrase('give'), close_clause()]

const EXAMPLE = '4,2,2,2|(NPA|John|)|(VP|give|)|~John gave.'
const OTHER_EXAMPLE = '4,17,2,2|(NPA|Xerxes|)|(VP|give|)|~Xerxes gave.'
const CURATED_EXAMPLES = `${EXAMPLE}\n${OTHER_EXAMPLE}\n`

type FindOptions = {
	search: string
	curated_examples?: string
	fetch_verse?: (reference: Reference) => Promise<SourceEntity[] | null>
}

const find = ({ search, curated_examples = CURATED_EXAMPLES, fetch_verse = async () => VERSE }: FindOptions) =>
	find_curated_example_source({ search_params: new URLSearchParams(search), concept: GIVE, curated_examples, fetch_verse })

describe('find_curated_example_source from a verse', () => {
	it('makes the example from the first use of the concept, and asks the verse for its reference', async () => {
		const fetch_verse = vi.fn(async () => VERSE)
		const source = await find({ search: 'reference=Bible/Exodus/2/3', fetch_verse })

		expect(fetch_verse).toHaveBeenCalledWith({ type: 'Bible', id_primary: 'Exodus', id_secondary: '2', id_tertiary: '3' })
		expect(source).toMatchObject({
			reference: { type: 'Bible', id_primary: 'Exodus', id_secondary: '2', id_tertiary: '3' },
			sentence: '',
			replaces: null,
			word_indexes: [5, 11],
			word_index: 5,
		})
		expect(source.encoding.map(({ value }) => value)).toEqual(['(', 'John', ')', '(', 'give', ')', '(', 'book', ')', '(', 'give', ')'])
		expect(source.encoding.map(({ parent }) => parent)).toEqual([-1, 0, 0, -1, 3, 3, -1, 6, 6, -1, 9, 9])
	})

	it('uses the use of the concept that the entity names', async () => {
		const source = await find({ search: 'reference=Bible/Exodus/2/3&entity=11' })
		expect(source.word_index).toBe(11)
		expect(source.word_indexes).toEqual([5, 11])
	})

	it('says when the entity is not a use of the concept', async () => {
		await expect(find({ search: 'reference=Bible/Exodus/2/3&entity=2' })).rejects.toMatchObject({ status: 400 })
		await expect(find({ search: 'reference=Bible/Exodus/2/3&entity=two' })).rejects.toMatchObject({ status: 400 })
	})

	it('says when the verse is missing, or does not use the concept', async () => {
		await expect(find({ search: 'reference=Bible/Exodus/2/3', fetch_verse: async () => null })).rejects.toMatchObject({ status: 404 })
		await expect(find({ search: 'reference=Bible/Exodus/2/3', fetch_verse: async () => [open_clause(), ...verb_phrase('go'), close_clause()] })).rejects.toMatchObject({ status: 404 })
	})

	it('says when the reference is not one', async () => {
		await expect(find({ search: 'reference=Bible/Exodus/2' })).rejects.toMatchObject({ status: 400 })
		await expect(find({ search: 'reference=' })).rejects.toMatchObject({ status: 400 })
	})

	it('says when the word is not in a clause', async () => {
		await expect(find({ search: 'reference=Bible/Exodus/2/3', fetch_verse: async () => verb_phrase('give') })).rejects.toMatchObject({ status: 400 })
	})
})

describe('find_curated_example_source from an encoded example', () => {
	it('starts from the entities and the sentence of the example', async () => {
		const source = await find({ search: `example=${encodeURIComponent('4,2,2,2|(NPA|John|)|(VP|give|)|~John gave Mary a book.')}` })

		expect(source).toMatchObject({ reference: { type: 'Bible', id_primary: 'Exodus', id_secondary: '2', id_tertiary: '2' }, sentence: 'John gave Mary a book.', replaces: null, word_indexes: [], word_index: null })
		expect(source.encoding.map(({ value }) => value)).toEqual(['(', 'John', ')', '(', 'give', ')'])
	})

	it('says when it is not an example', async () => {
		await expect(find({ search: 'example=hello' })).rejects.toMatchObject({ status: 400 })
		await expect(find({ search: 'example=' })).rejects.toMatchObject({ status: 400 })
		await expect(find({ search: `example=${encodeURIComponent(CURATED_EXAMPLES)}` })).rejects.toMatchObject({ status: 400 })
	})
})

describe('find_curated_example_source from an existing example', () => {
	it('edits the example that replaces names, which is also the one that saving replaces', async () => {
		const source = await find({ search: 'replaces=1' })
		expect(source).toMatchObject({ reference: { id_primary: 'Esther' }, sentence: 'Xerxes gave.', replaces: 1 })
	})

	it('says when there is no such example', async () => {
		await expect(find({ search: 'replaces=2' })).rejects.toMatchObject({ status: 400 })
		await expect(find({ search: 'replaces=-1' })).rejects.toMatchObject({ status: 400 })
		await expect(find({ search: 'replaces=0', curated_examples: '' })).rejects.toMatchObject({ status: 400 })
	})

	it('also says which example saving replaces when the example comes from a verse', async () => {
		const source = await find({ search: 'reference=Bible/Exodus/2/3&replaces=0' })
		expect(source.replaces).toBe(0)
		expect(source.sentence).toBe('')
	})
})

describe('find_curated_example_source with nothing to start from', () => {
	it('says what it needs', async () => {
		await expect(find({ search: '' })).rejects.toMatchObject({ status: 400 })
	})
})
