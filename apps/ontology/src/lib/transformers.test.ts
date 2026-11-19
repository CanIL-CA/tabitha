import { describe, expect, it } from 'vitest'
import {
	create_fallback_concept,
	decode_categorization,
	encode_categorization,
	encode_curated_example,
	transform_curated_examples,
} from './transformers'
import { curated_example_boundaries, curated_example_feature_codes } from './lookups'
import type { EncodeCuratedExampleRequest, PartOfSpeech, SourceEntity } from '@tabitha/types'

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
				{ category: 'NP', word: undefined, feature: { code: 'A', value: 'Agent' } },
				{ category: 'Word', word: 'baby', feature: undefined },
				{ category: 'Phrase end', word: undefined, feature: undefined },
				{ category: 'VP', word: undefined, feature: undefined },
				{ category: 'Word', word: 'be', feature: undefined },
				{ category: 'Phrase end', word: undefined, feature: undefined },
				{ category: 'AdjP', word: undefined, feature: { code: 'P', value: 'Predicative' } },
				{ category: 'Word', word: 'beautiful', feature: undefined },
				{ category: 'Phrase end', word: undefined, feature: undefined },
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
			expect(clause?.feature).toEqual({ code: 'p', value: 'Attributive Patient' })
		})
	})

	describe('encode_curated_example', () => {
		const reference = { type: 'Bible', id_primary: 'Exodus', id_secondary: '2', id_tertiary: '2' }

		const entity = (overrides: Partial<SourceEntity>): SourceEntity => ({
			category: '', category_abbr: '', value: '', concept: null, pairing_concept: null, pairing_type: null,
			feature_codes: '', features: [], noun_list_index: null, ...overrides,
		})
		const feature = (f: { name: string; value: string }) => [f]
		const open_clause = (type = 'Independent') => entity({ category: 'Clause', category_abbr: 'C', value: '{', features: [{ name: 'Type', value: type }] })
		const open_phrase = ({ category, features = [] }: { category: SourceEntity['category']; features?: SourceEntity['features'] }) => entity({ category, category_abbr: 'P', value: '(', features })
		const word = ({ category, stem, value = stem }: { category: PartOfSpeech; stem: string; value?: string }) => entity({ category, value, concept: { stem, sense: 'A', part_of_speech: category } })
		const close_phrase = () => entity({ value: ')' })
		const close_clause = () => entity({ value: '}' })

		const noun_phrase = ({ stem, role }: { stem: string; role: string }) => [
			open_phrase({ category: 'Noun Phrase', features: [{ name: 'Semantic Role', value: role }] }),
			word({ category: 'Noun', stem }),
			close_phrase(),
		]
		const verb_phrase = (value: string) => [open_phrase({ category: 'Verb Phrase' }), word({ category: 'Verb', stem: value }), close_phrase()]
		const adj_phrase = ({ stem, usage = 'Predicative' }: { stem: string; usage?: string }) => [
			open_phrase({ category: 'Adjective Phrase', features: [{ name: 'Usage', value: usage }] }),
			word({ category: 'Adjective', stem }),
			close_phrase(),
		]

		const be_beautiful = [
			open_clause(),
			...noun_phrase({ stem: 'baby', role: 'Most Agent-like' }),
			...verb_phrase('be'),
			...adj_phrase({ stem: 'beautiful' }),
			close_clause(),
		]

		it('encodes the contents of the clause, without the clause itself', () => {
			expect(encode_curated_example({ reference, sentence: 'The baby was beautiful.', entities: be_beautiful })).toEqual({
				encoded_example: '4,2,2,2|(NPA|baby|)|(VP|be|)|(APP|beautiful|)|~The baby was beautiful.',
			})
		})

		it('encodes an argument clause with its own contents', () => {
			const entities = [
				open_clause(),
				{ ...open_clause('Agent (Subject Complement)'), value: '[' },
				...noun_phrase({ stem: 'John', role: 'Most Agent-like' }),
				...verb_phrase('read'),
				entity({ value: ']' }),
				...verb_phrase('be'),
				...adj_phrase({ stem: 'true' }),
				close_clause(),
			]

			const result = encode_curated_example({ reference, sentence: 'It is true that John read.', entities })
			expect(result).toEqual({ encoded_example: '4,2,2,2|[A|(NPA|John|)|(VP|read|)|]|(VP|be|)|~It is true that John read.' })
		})

		it('writes a noun phrase with no semantic role, and an adverb phrase, as the format does', () => {
			const entities = [
				open_clause(),
				...noun_phrase({ stem: 'man', role: 'Not Applicable' }),
				open_phrase({ category: 'Adverb Phrase' }),
				word({ category: 'Adverb', stem: 'never' }),
				close_phrase(),
				close_clause(),
			]
			const result = encode_curated_example({ reference, sentence: 'The man never.', entities })
			expect(result).toEqual({ encoded_example: '4,2,2,2|(NPN|man|)|(aP|never|)|~The man never.' })
		})

		it('encodes an attributive patient clause inside an adjective phrase', () => {
			const entities = [
				open_clause(),
				...noun_phrase({ stem: 'John', role: 'Most Agent-like' }),
				...verb_phrase('be'),
				open_phrase({ category: 'Adjective Phrase', features: feature({ name: 'Usage', value: 'Predicative' }) }),
				word({ category: 'Adjective', stem: 'ready' }),
				{ ...open_clause('Attributive Patient (Adjectival Object Complement)'), value: '[' },
				...noun_phrase({ stem: 'John', role: 'Most Agent-like' }),
				...verb_phrase('read'),
				...noun_phrase({ stem: 'book', role: 'Most Patient-like' }),
				entity({ value: ']' }),
				close_phrase(),
				close_clause(),
			]
			const result = encode_curated_example({ reference, sentence: 'John is ready to read that book.', entities })
			expect(result).toEqual({ encoded_example: '4,2,2,2|(NPA|John|)|(VP|be|)|(APP|ready|[p|(NPA|John|)|(VP|read|)|(NPP|book|)|]|)|~John is ready to read that book.' })
		})

		it('ignores entities that are not words or brackets, and trims the sentence', () => {
			const entities = [open_clause(), entity({ category: 'Format Marker', value: 'Paragraph' }), ...verb_phrase('rain'), entity({ category: 'period', value: '.' }), close_clause()]
			const result = encode_curated_example({ reference, sentence: '  It rained.  ', entities })
			expect(result).toEqual({ encoded_example: '4,2,2,2|(VP|rain|)|~It rained.' })
		})

		it('produces a line that transform_curated_examples decodes back', () => {
			const result = encode_curated_example({ reference, sentence: 'The baby was beautiful.', entities: be_beautiful })
			const [decoded] = transform_curated_examples('encoded_example' in result ? result.encoded_example : '')

			expect(decoded.reference).toEqual(reference)
			expect(decoded.sentence).toBe('The baby was beautiful.')
			expect(decoded.encoding.map(({ category, word, feature }) => [category, word, feature?.value])).toEqual([
				['NP', undefined, 'Agent'],
				['Word', 'baby', undefined],
				['Phrase end', undefined, undefined],
				['VP', undefined, undefined],
				['Word', 'be', undefined],
				['Phrase end', undefined, undefined],
				['AdjP', undefined, 'Predicative'],
				['Word', 'beautiful', undefined],
				['Phrase end', undefined, undefined],
			])
		})

		describe('rejects what cannot be encoded', () => {
			const message_for = (overrides: Partial<EncodeCuratedExampleRequest>) => {
				const result = encode_curated_example({ reference, sentence: 'A sentence.', entities: be_beautiful, ...overrides })
				return 'error' in result ? result.error : undefined
			}

			it.each([
				['an empty sentence', { sentence: '  ' }, 'The English sentence is empty.'],
				['a sentence with a pipe', { sentence: 'a | b' }, 'The English sentence cannot contain "|" or a line break.'],
				['a sentence with a line break', { sentence: 'a\nb' }, 'The English sentence cannot contain "|" or a line break.'],
				['an unknown book', { reference: { ...reference, id_primary: 'Hezekiah' } }, 'The reference Bible Hezekiah 2:2 cannot be used in a curated example.'],
				['an unknown source type', { reference: { ...reference, type: 'Scroll' } }, 'The reference Scroll Exodus 2:2 cannot be used in a curated example.'],
				['a non-numeric chapter', { reference: { ...reference, id_secondary: 'two' } }, 'The reference Bible Exodus two:2 cannot be used in a curated example.'],
				['no entities', { entities: [] }, 'The entities must start with a clause and end with its closing bracket.'],
				['entities that do not start with a clause', { entities: be_beautiful.slice(1) }, 'The entities must start with a clause and end with its closing bracket.'],
				['entities with only the clause', { entities: [open_clause(), close_clause()] }, 'There is nothing to encode.'],
				['an unclosed phrase', { entities: be_beautiful.filter((_, i) => i !== 3) }, 'An opening bracket has no closing bracket.'],
				['a phrase closed twice', { entities: [open_clause(), ...verb_phrase('go'), close_phrase(), close_clause()] }, 'A closing bracket has no opening bracket.'],
				['a word whose stem contains a pipe', { entities: [open_clause(), ...verb_phrase('a|b'), close_clause()] }, 'The word "a|b" cannot be used in a curated example.'],
			])('%s', (_description, overrides, expected_message) => {
				expect(message_for(overrides)).toBe(expected_message)
			})

			it('rejects a clause that is not an argument clause', () => {
				const relative_clause = [open_clause('Restrictive Thing Modifier (Relative Clause)'), ...verb_phrase('go'), close_clause()]
				const entities = [open_clause(), ...relative_clause, close_clause()]
				expect(message_for({ entities })).toBe('A Clause with Type "Restrictive Thing Modifier (Relative Clause)" cannot be used in a curated example.')
			})
		})

		it('uses only codes that transform_curated_examples knows', () => {
			const decoder_codes_by_boundary: Record<string, string> = { 'Noun Phrase': 'NP', 'Adjective Phrase': 'AdjP', 'Clause': 'Clause' }
			for (const [category, boundary] of Object.entries(curated_example_boundaries)) {
				const known_codes = Object.keys(curated_example_feature_codes[decoder_codes_by_boundary[category]] ?? {})
				for (const code of Object.values(boundary.feature?.codes ?? {})) {
					expect(known_codes, `${category} code ${code}`).toContain(code)
				}
			}
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
