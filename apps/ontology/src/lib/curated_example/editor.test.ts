import { describe, expect, it } from 'vitest'
import { structure_curated_example_encoding, transform_curated_examples } from '#lib/transformers.js'
import { CuratedExampleEditor, find_deletable_roots, find_unit_root, remove_unit } from './editor.svelte.js'
import type { ConceptKey } from '@tabitha/types'
import type { CuratedExampleEntityStructured } from '#lib/types.js'

const GIVE: ConceptKey = { stem: 'give', sense: 'A', part_of_speech: 'Verb' }
const reference = { type: 'Bible', id_primary: 'Exodus', id_secondary: '2', id_tertiary: '2' }

//         0    1     2  3   4    5  6    7     8  9     10   11
const TOKENS = '(NPA|John|)|(VP|give|)|(NPP|book|)|(NPd|Mary|)'

const grid = (categories: Record<number, string>) => Array.from({ length: 9 }, (_, i) => categories[i] ?? '')
const CATEGORIES = grid({ 0: 'Agent-like', 1: 'Patient-like' })

const values = (encoding: CuratedExampleEntityStructured[]): string[] => encoding.map(({ value }) => value)

const decode = (tokens: string) => 
	structure_curated_example_encoding(transform_curated_examples(`4,2,2,2|${tokens}|~A sentence.`)[0].encoding)

type CreateOptions = {
	tokens?: string
	categories?: string[]
	curated_examples?: string
	sentence?: string
	replaces?: number | null
}

const create_editor = ({ tokens = TOKENS, categories = CATEGORIES, curated_examples = '', sentence = '', replaces = null }: CreateOptions = {}) =>
	new CuratedExampleEditor({
		concept: GIVE,
		categories,
		curated_examples,
		reference,
		encoding: decode(tokens),
		sentence,
		replaces,
	})

describe('CuratedExampleEditor', () => {
	describe('the case frame', () => {
		it('says what the example shows that the concept does not have', () => {
			const editor = create_editor()
			expect(editor.case_frame_changes).toEqual([{ kind: 'new', label: 'Destination' }])
		})

		it('says what the concept requires that the example does without', () => {
			const editor = create_editor({ tokens: '(NPA|John|)|(VP|give|)' })
			expect(editor.case_frame_changes).toEqual([{ kind: 'no', label: 'Patient-like' }])
		})

		it('starts the categories as what the example calls for', () => {
			expect(create_editor().categories).toEqual(grid({ 0: 'Agent-like', 1: 'Patient-like', 4: '(Destination)' }))
		})

		it('has no changes for a part of speech without a case frame', () => {
			const editor = new CuratedExampleEditor({
				concept: { stem: 'baby', sense: 'A', part_of_speech: 'Noun' },
				categories: ['Abstracts'],
				curated_examples: '',
				reference,
				encoding: decode('(NPA|baby|)'),
				sentence: '',
				replaces: null,
			})
			expect(editor.has_case_frame).toBe(false)
			expect(editor.case_frame_changes).toEqual([])
			expect(editor.categories).toEqual(['Abstracts'])
		})
	})

	describe('deleting', () => {
		it('deletes the whole phrase that holds the entity that was clicked', () => {
			const editor = create_editor()
			editor.delete_unit(10)
			expect(editor.encoding.map(({ value }) => value)).toEqual(['(', 'John', ')', '(', 'give', ')', '(', 'book', ')'])
		})

		it('does not delete what holds the word', () => {
			const editor = create_editor()
			expect(editor.is_deletable(4)).toBe(false)
			editor.delete_unit(4)
			editor.delete_unit(3)
			expect(editor.encoding).toHaveLength(12)
		})

		it('changes the categories with the example', () => {
			const editor = create_editor()
			editor.delete_unit(10)
			expect(editor.categories).toEqual(CATEGORIES)

			editor.delete_unit(7)
			expect(editor.case_frame_changes).toEqual([{ kind: 'no', label: 'Patient-like' }])
			expect(editor.categories).toEqual(grid({ 0: 'Agent-like', 1: '(Patient-like)' }))
		})

		it('leaves the categories alone once the user has changed them, until the suggestion is applied', () => {
			const editor = create_editor()
			editor.categories = grid({ 0: 'Agent-like', 1: 'Patient-like', 5: 'Instrument' })
			expect(editor.is_following_example).toBe(false)

			editor.delete_unit(10)
			expect(editor.categories).toEqual(grid({ 0: 'Agent-like', 1: 'Patient-like', 5: 'Instrument' }))
			expect(editor.suggested_categories).toEqual(CATEGORIES)

			editor.apply_suggestion()
			expect(editor.categories).toEqual(CATEGORIES)
			expect(editor.is_following_example).toBe(true)
		})

		it('highlights the unit under the pointer, but not what cannot be deleted', () => {
			const editor = create_editor()
			editor.hover(7)
			expect([...editor.hovered_unit_indexes]).toEqual([6, 7, 8])

			editor.hover(4)
			expect([...editor.hovered_unit_indexes]).toEqual([])
		})
	})

	describe('saving', () => {
		it('cannot be saved without an English sentence', () => {
			const editor = create_editor()
			expect(editor.validation_message).toBe('The English sentence is empty.')
			expect(editor.curated_examples_to_save).toBeUndefined()
		})

		it('has the encoded example and the curated examples to save, once it has a sentence', () => {
			const existing = '4,17,2,2|(NPA|Xerxes|)|(VP|search|)|~Xerxes searched.\n'
			const editor = create_editor({ curated_examples: existing, sentence: 'John gave Mary a book.' })

			expect(editor.validation_message).toBe('')
			expect(editor.encoded_example).toBe('4,2,2,2|(NPA|John|)|(VP|give|)|(NPP|book|)|(NPd|Mary|)|~John gave Mary a book.')
			expect(editor.curated_examples_to_save).toBe(`${existing}${editor.encoded_example}\n`)
		})

		it('cannot be saved when the concept already has the example', () => {
			const line = '4,2,2,2|(NPA|John|)|(VP|give|)|(NPP|book|)|(NPd|Mary|)|~John gave Mary a book.'
			const editor = create_editor({ curated_examples: `${line}\n`, sentence: 'John gave Mary a book.' })
			expect(editor.validation_message).toBe('The concept already has this example.')
		})

		it('replaces the example it is editing, which is not a duplicate of itself', () => {
			const line = '4,2,2,2|(NPA|John|)|(VP|give|)|(NPP|book|)|(NPd|Mary|)|~John gave Mary a book.'
			const other = '4,17,2,2|(NPA|Xerxes|)|(VP|search|)|~Xerxes searched.'
			const editor = create_editor({ curated_examples: `${line}\n${other}\n`, sentence: 'John gave a book to Mary.', replaces: 0 })

			expect(editor.validation_message).toBe('')
			expect(editor.curated_examples_to_save).toBe(`${editor.encoded_example}\n${other}\n`)
		})

		it('cannot be saved when the example does not use the concept', () => {
			const editor = create_editor({ tokens: '(NPA|John|)|(VP|go|)', sentence: 'John went.' })
			expect(editor.validation_message).toBe('The example does not use "give".')
		})

		it('says why the example cannot be written when it cannot', () => {
			const editor = create_editor({ sentence: 'John | Mary' })
			expect(editor.validation_message).toBe('The English sentence cannot contain "|" or a line break.')
		})
	})

	describe('reset', () => {
		it('puts back the entities, the sentence and the categories', () => {
			const editor = create_editor({ sentence: 'John gave Mary a book.' })
			editor.delete_unit(10)
			editor.delete_unit(7)
			editor.sentence = 'Something else.'
			editor.categories = grid({ 3: 'Source' })

			editor.reset()

			expect(editor.encoding).toHaveLength(12)
			expect(editor.sentence).toBe('John gave Mary a book.')
			expect(editor.categories).toEqual(grid({ 0: 'Agent-like', 1: 'Patient-like', 4: '(Destination)' }))
		})
	})
})

describe('unit handling', () => {
	describe('find_deletable_roots', () => {
		it('is the phrases and clauses that do not hold the word, but not the ones that do', () => {
			//                      0   1    2  3  4    5  6   7    8  9  10    11 12 13       14
			const encoding = decode('(NPA|John|)|(VP|give|)|(NPP|book|)|(NPP|bread|)|(aP|quickly|)')
			expect(find_deletable_roots({ encoding, stem: 'give' })).toEqual([0, 6, 9, 12])
		})

		it('includes a phrase inside a phrase', () => {
			//                      0    1   2    3    4  5  6   7   8
			const encoding = decode('(NPA|man|(APA|good|)|)|(VP|go|)')
			expect(find_deletable_roots({ encoding, stem: 'go' })).toEqual([0, 2])
		})

		it('includes a word that is directly in the clause, but not one in a phrase', () => {
			const encoding = decode('(VP|go|)|and|(VP|stay|)')
			expect(find_deletable_roots({ encoding, stem: 'go' })).toEqual([3, 4])
		})

		it('does not include the clause that holds the word, nor the phrase the word is in, but does include what is beside them', () => {
			//                      0  1    2    3  4    5    6  7  8    9   10
			const encoding = decode('[A|(NPA|John|)|(VP|read|)|]|(VP|be|)')
			expect(find_deletable_roots({ encoding, stem: 'read' })).toEqual([1, 8])
		})

		it('allows either of two uses of the word to go, but not both', () => {
			const encoding = decode('(VP|go|)|(VP|go|)')
			expect(find_deletable_roots({ encoding, stem: 'go' })).toEqual([0, 3])
			expect(find_deletable_roots({ encoding: remove_unit({ encoding, root: 0 }), stem: 'go' })).toEqual([])
		})

		it('does not include a phrase that is never closed, nor the word in it', () => {
			const encoding = decode('(VP|go').slice(0, 2)
			expect(find_deletable_roots({ encoding, stem: 'other' })).toEqual([])
		})
	})

	describe('find_unit_root', () => {
		const encoding = decode('(NPA|man|(APA|good|)|)|(VP|go|)')
		const deletable_roots = find_deletable_roots({ encoding, stem: 'go' })

		it('is the innermost deletable unit that holds the entity, whichever part of it is clicked', () => {
			expect(find_unit_root({ encoding, deletable_roots, index: 3 })).toBe(2)
			expect(find_unit_root({ encoding, deletable_roots, index: 4 })).toBe(2)
			expect(find_unit_root({ encoding, deletable_roots, index: 1 })).toBe(0)
			expect(find_unit_root({ encoding, deletable_roots, index: 5 })).toBe(0)
		})

		it('is nothing for an entity that is only in units that cannot be deleted', () => {
			expect(find_unit_root({ encoding, deletable_roots, index: 7 })).toBeUndefined()
			expect(find_unit_root({ encoding, deletable_roots, index: 6 })).toBeUndefined()
		})

		it('is nothing for an index that is not in the encoding', () => {
			expect(find_unit_root({ encoding, deletable_roots, index: -1 })).toBeUndefined()
			expect(find_unit_root({ encoding, deletable_roots, index: 99 })).toBeUndefined()
		})
	})

	describe('remove_unit', () => {
		it('removes the whole unit', () => {
			const encoding = decode('(NPA|John|)|(VP|give|)|(NPP|book|)')
			expect(values(remove_unit({ encoding, root: 6 }))).toEqual(['(', 'John', ')', '(', 'give', ')'])
		})

		it('removes a single word', () => {
			const encoding = decode('(VP|go|)|and|(VP|stay|)')
			expect(values(remove_unit({ encoding, root: 3 }))).toEqual(['(', 'go', ')', '(', 'stay', ')'])
		})

		it('leaves the encoding alone when the unit is never closed', () => {
			const encoding = decode('(VP|go|)').slice(0, 2)
			expect(remove_unit({ encoding, root: 0 })).toEqual(encoding)
		})
	})
})
