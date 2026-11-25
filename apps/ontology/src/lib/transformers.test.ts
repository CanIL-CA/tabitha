import { describe, expect, it } from 'vitest'
import {
	create_fallback_concept,
	decode_categorization,
	encode_categorization,
	encode_curated_example,
	transform_curated_examples,
} from './transformers'
import type { CuratedExampleEntity } from './types'

const entity = (overrides: Partial<CuratedExampleEntity>): CuratedExampleEntity => ({
	category: '', category_abbr: '', value: '', feature_codes: '', features: [], ...overrides,
})

describe('transformers', () => {
	describe('transform_curated_examples', () => {
		it('returns empty array when input is empty string', () => {
			expect(transform_curated_examples('')).toEqual([])
		})

		it('decodes curated examples correctly', () => {
			const raw = '4,2,2,2|(NPA|baby|)|(VP|be|)|(APP|beautiful|)|~The baby was beautiful.\n'
			const result = transform_curated_examples(raw)

			expect(result).toHaveLength(1)
			expect(result[0].reference).toEqual({
				type: 'Bible',
				id_primary: 'Exodus',
				id_secondary: '2',
				id_tertiary: '2',
			})
			expect(result[0].sentence).toBe('The baby was beautiful.')
			expect(result[0].encoding).toEqual([
				entity({ category: 'Noun Phrase', category_abbr: 'NP', value: '(', feature_codes: 'A', features: [{ name: 'Semantic Role', value: 'Most Agent-like' }] }),
				entity({ value: 'baby' }),
				entity({ value: ')' }),
				entity({ category: 'Verb Phrase', category_abbr: 'VP', value: '(' }),
				entity({ value: 'be' }),
				entity({ value: ')' }),
				entity({ category: 'Adjective Phrase', category_abbr: 'AdjP', value: '(', feature_codes: 'P', features: [{ name: 'Usage', value: 'Predicative' }] }),
				entity({ value: 'beautiful' }),
				entity({ value: ')' }),
			])
		})

		it('decodes multiple curated example lines', () => {
			const raw = [
				'4,2,2,2|(NPA|baby|)|(VP|be|)|(APP|beautiful|)|~The baby was beautiful.',
				'4,17,2,2|(NPA|Xerxes|)|(VP|search|)|(NPP|(APA|beautiful|)|virgin|)|~Xerxes searched for a beautiful virgin.',
			].join('\n')

			const result = transform_curated_examples(raw)
			expect(result).toHaveLength(2)
			expect(result[0].sentence).toBe('The baby was beautiful.')
			expect(result[1].sentence).toBe('Xerxes searched for a beautiful virgin.')
			expect(result[1].reference.id_primary).toBe('Esther')
		})

		it('decodes an attributive patient clause with its feature', () => {
			const raw = '6,8,1,37|(NPA|John|)|(VP|be|)|(APP|ready|[p|(NPA|John|)|(VP|read|)|(NPP|book|)|]|)|~John is ready to read that book.'
			const clause = transform_curated_examples(raw)[0].encoding.find(({ category }) => category === 'Clause')
			expect(clause).toEqual(entity({
				category: 'Clause', category_abbr: 'Prop', value: '[', feature_codes: 'p',
				features: [{ name: 'Type', value: 'Attributive Patient (Adjectival Object Complement)' }],
			}))
		})
	})

	describe('encode_curated_example', () => {
		const reference = { type: 'Bible', id_primary: 'Exodus', id_secondary: '2', id_tertiary: '2' }

		const encode_options = (overrides: Partial<Parameters<typeof encode_curated_example>[0]> = {}) => ({
			reference,
			sentence: 'A sentence.',
			encoding: transform_curated_examples('4,2,2,2|(NPA|baby|)|(VP|be|)|(APP|beautiful|)|~x')[0].encoding,
			...overrides,
		})

		const error_for = (overrides: Partial<Parameters<typeof encode_curated_example>[0]>) => {
			const result = encode_curated_example(encode_options(overrides))
			return 'error' in result ? result.error : undefined
		}

		it('encodes a simplified encoding, with the sentence trimmed', () => {
			const result = encode_curated_example(encode_options({ sentence: '  The baby was beautiful.  ' }))
			expect(result).toEqual({ encoded_example: '4,2,2,2|(NPA|baby|)|(VP|be|)|(APP|beautiful|)|~The baby was beautiful.' })
		})

		it.each([
			'4,2,2,2|(NPA|baby|)|(VP|be|)|(APP|beautiful|)|~The baby was beautiful.',
			'4,17,2,2|(NPA|Xerxes|)|(VP|search|)|(NPP|(APA|beautiful|)|virgin|)|~Xerxes searched for a beautiful virgin.',
			"4,40,6,29|(NPA|clothes|(NPN|of|flower|)|)|(VP|be|)|(APP|beautiful|(NPN|clothes|(NPN|of|Solomon|)|)|)|~The flower's clothes are more beautiful than Solomon's clothes.",
			'6,8,1,67|[A|(NPA|John|)|(VP|read|)|(NPP|book|)|]|(VP|be|)|(APP|true|)|~It is true that John read that book.',
			"4,41,14,21|[A|(NPA|man|)|(VP|born|)|(aP|never|)|]|(VP|be|)|(APP|good|)|(NPB|man|)|~It's better for that man that he was never born.",
			'6,8,1,37|(NPA|John|)|(VP|be|)|(APP|ready|[p|(NPA|John|)|(VP|read|)|(NPP|book|)|]|)|~John is ready to read that book.',
		])('gives back the line that transform_curated_examples decoded: %s', line => {
			const [{ reference, encoding, sentence }] = transform_curated_examples(line)
			expect(encode_curated_example({ reference, encoding, sentence })).toEqual({ encoded_example: line })
		})

		it('writes N for a noun phrase that has no code, and keeps a code that the format does not know', () => {
			const encoding = [
				entity({ category: 'Noun Phrase', category_abbr: 'NP', value: '(' }), entity({ value: 'man' }), entity({ value: ')' }),
				entity({ category: 'Clause', category_abbr: 'Prop', value: '[', feature_codes: 'x' }), entity({ value: ']' }),
			]
			expect(encode_curated_example(encode_options({ encoding }))).toEqual({ encoded_example: '4,2,2,2|(NPN|man|)|[x|]|~A sentence.' })
		})

		it('encodes only the features that have a code', () => {
			const [{ encoding }] = transform_curated_examples('4,2,2,2|(NPA|baby|)|(VP|be|)|(APP|beautiful|)|~x')
			const with_degree = encoding.map(example_entity => example_entity.value === 'beautiful' ? { ...example_entity, features: [{ name: 'Degree', value: 'Comparative' }] } : example_entity)
			expect(encode_curated_example(encode_options({ encoding: with_degree }))).toEqual(encode_curated_example(encode_options({ encoding })))
		})

		it.each([
			['an empty sentence', { sentence: '  ' }, 'The English sentence is empty.'],
			['a sentence with a pipe', { sentence: 'a | b' }, 'The English sentence cannot contain "|" or a line break.'],
			['a sentence with a line break', { sentence: 'a\nb' }, 'The English sentence cannot contain "|" or a line break.'],
			['an unknown book', { reference: { ...reference, id_primary: 'Hezekiah' } }, 'The reference Bible Hezekiah 2:2 cannot be used in a curated example.'],
			['an unknown source type', { reference: { ...reference, type: 'Scroll' } }, 'The reference Scroll Exodus 2:2 cannot be used in a curated example.'],
			['a non-numeric chapter', { reference: { ...reference, id_secondary: 'two' } }, 'The reference Bible Exodus two:2 cannot be used in a curated example.'],
			['an empty encoding', { encoding: [] }, 'There is nothing to encode.'],
			['an unknown category', { encoding: [entity({ category: 'Section', value: '(' }), entity({ value: ')' })] }, 'A Section cannot be used in a curated example.'],
			['a word that cannot be in an example', { encoding: [entity({ category: 'period', value: '.' })] }, 'A period cannot be used in a curated example.'],
			['a word with a pipe', { encoding: [entity({ value: 'a|b' })] }, 'The word "a|b" cannot be used in a curated example.'],
			['a word that is empty', { encoding: [entity({ value: '' })] }, 'The word "" cannot be used in a curated example.'],
			['a phrase that is not closed', { encoding: [entity({ category: 'Verb Phrase', value: '(' })] }, 'An opening bracket has no closing bracket.'],
			['a phrase that is closed twice', { encoding: [entity({ value: ')' })] }, 'A closing bracket has no opening bracket.'],
			['a phrase that is closed like a clause', { encoding: [entity({ category: 'Verb Phrase', value: '(' }), entity({ value: ']' })] }, 'A closing bracket does not match its opening bracket.'],
		])('rejects %s', (_description, overrides, expected_message) => {
			expect(error_for(overrides)).toBe(expected_message)
		})
	})

	describe('categorization decoders & encoders', () => {
		it('decodes and encodes noun categorizations', () => {
			expect(decode_categorization({ part_of_speech: 'Noun', categorization: 'A' })).toEqual(['Abstracts'])
			expect(decode_categorization({ part_of_speech: 'Noun', categorization: 'o' })).toEqual(['All other objects'])
			expect(decode_categorization({ part_of_speech: 'Noun', categorization: '' })).toEqual(['No information available yet.'])

			expect(encode_categorization({ part_of_speech: 'Noun', categories: ['Abstracts'] })).toBe('A')
			expect(encode_categorization({ part_of_speech: 'Noun', categories: ['All other objects'] })).toBe('o')
			expect(encode_categorization({ part_of_speech: 'Noun', categories: [] })).toBe('o')
		})

		it('decodes and encodes verb theta grids', () => {
			const db_verb = 'Ab_______'
			const decoded = decode_categorization({ part_of_speech: 'Verb', categorization: db_verb })
			expect(decoded).toEqual(['Agent-like', '(Patient-like)'])

			const reencoded = encode_categorization({ part_of_speech: 'Verb', categories: ['Agent-like', '(Patient-like)', '', '', '', '', '', '', ''] })
			expect(reencoded).toBe('Ab_______')
		})

		it('decodes and encodes adjective categorizations', () => {
			const db_adj = 'GA_____'
			const decoded = decode_categorization({ part_of_speech: 'Adjective', categorization: db_adj })
			expect(decoded).toEqual([
				'Generic',
				'always used attributively',
				'never used predicatively without an argument',
				'never used predicatively with a nominal argument',
				'never used predicatively with a same participant clausal argument',
				'never used predicatively with a different participant clausal argument',
				'never used comparatively',
			])

			const reencoded = encode_categorization({ part_of_speech: 'Adjective', categories: decoded })
			expect(reencoded).toBe('GA_____')
		})

		it('decodes and encodes particle categorizations (Adposition, Adverb, Conjunction)', () => {
			const db_adp = 'Ab_'
			const decoded = decode_categorization({ part_of_speech: 'Adposition', categorization: db_adp })
			expect(decoded).toEqual([
				'always used in Adjunct Phrases',
				'sometimes used in Noun-Noun Phrases',
				'never used in Abverbial Clauses',
			])

			const reencoded = encode_categorization({ part_of_speech: 'Adposition', categories: decoded })
			expect(reencoded).toBe('Ab_')
		})

		it('handles fallback for unknown part of speech', () => {
			expect(decode_categorization({ part_of_speech: 'Unknown', categorization: 'xyz' })).toEqual(['x', 'y', 'z'])
			expect(encode_categorization({ part_of_speech: 'Unknown', categories: ['xyz'] })).toBe('')
		})
	})

	describe('create_fallback_concept', () => {
		it('creates a concept with default values', () => {
			const fallback = create_fallback_concept()
			expect(fallback.id).toBe('')
			expect(fallback.stem).toBe('')
			expect(fallback.level).toBe('1')
			expect(fallback.status).toBe('not used')
			expect(fallback.categories).toEqual([])
		})

		it('merges custom properties over defaults', () => {
			const fallback = create_fallback_concept({ stem: 'love', sense: '01', part_of_speech: 'Noun' })
			expect(fallback.stem).toBe('love')
			expect(fallback.sense).toBe('01')
			expect(fallback.part_of_speech).toBe('Noun')
			expect(fallback.level).toBe('1')
		})
	})
})
